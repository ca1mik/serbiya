import { pool, db } from "@/db/client";
import { and, eq, inArray } from "drizzle-orm";
import {
  auditEvents,
  dispatchDocuments,
  integrationConnections,
  integrationEvents,
  integrationRequests,
  jobs,
  shipments,
  validationIssues,
} from "@/db/schema";
import { classifyFailure, retryDelayMs } from "@/domain/retry";
import { getEotpremnicaAdapter } from "@/integrations/eotpremnica/adapters";
import type { EotpremnicaDocumentDTO } from "@/integrations/eotpremnica/types";
import { AppError } from "@/lib/errors";
import { recordProductEvent } from "@/lib/product-events";

type ClaimedJob = {
  id: string;
  organization_id: string;
  type: string;
  entity_id: string;
  attempts: number;
  max_attempts: number;
};
export async function recoverStaleJobs(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stale = await client.query<ClaimedJob>(
      "SELECT id, organization_id, type, entity_id, attempts, max_attempts FROM jobs WHERE status='RUNNING' AND locked_at < now() - interval '2 minutes' FOR UPDATE SKIP LOCKED",
    );
    for (const job of stale.rows) {
      if (job.type === "SUBMIT_DOCUMENT") {
        const reset = await client.query<{ shipment_id: string }>(
          "UPDATE integration_requests SET state='FAILED_TRANSIENT', error_code='WORKER_LEASE_EXPIRED', error_message='Worker lease expired; submission will be retried', updated_at=now() WHERE id=$1 AND organization_id=$2 AND state='SUBMITTING' RETURNING shipment_id",
          [job.entity_id, job.organization_id],
        );
        if (reset.rows[0])
          await client.query(
            "UPDATE shipments SET status='FAILED_TRANSIENT', document_status='FAILED_TRANSIENT', updated_at=now() WHERE id=$1 AND organization_id=$2 AND status='SUBMITTING'",
            [reset.rows[0].shipment_id, job.organization_id],
          );
        if (reset.rows[0])
          await client.query(
            "INSERT INTO integration_events(organization_id,request_id,event,detail) VALUES($1,$2,'WORKER_RECOVERED',$3::jsonb)",
            [
              job.organization_id,
              job.entity_id,
              JSON.stringify({ jobId: job.id, previousState: "SUBMITTING" }),
            ],
          );
      }
      await client.query(
        "UPDATE jobs SET status='PENDING', locked_at=NULL, run_at=now(), last_error='Worker lease expired; job recovered' WHERE id=$1",
        [job.id],
      );
    }
    await client.query("COMMIT");
    return stale.rowCount ?? 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function runOneJob(): Promise<boolean> {
  const result = await pool.query<ClaimedJob>(
    `UPDATE jobs SET status='RUNNING', locked_at=now(), attempts=attempts+1 WHERE id=(SELECT id FROM jobs WHERE status='PENDING' AND run_at<=now() ORDER BY run_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,organization_id,type,entity_id,attempts,max_attempts`,
  );
  const job = result.rows[0];
  if (!job) return false;
  try {
    if (job.type === "SUBMIT_DOCUMENT") await submit(job);
    else if (job.type === "POLL_DOCUMENT") await poll(job);
    else throw new Error(`Unknown job type ${job.type}`);
    await db
      .update(jobs)
      .set({ status: "DONE", lockedAt: null })
      .where(eq(jobs.id, job.id));
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        operation: "job",
        jobId: job.id,
        entityId: job.entity_id,
        organizationId: job.organization_id,
        result: "failed",
        errorType: error instanceof Error ? error.name : typeof error,
      }),
    );
    await db
      .update(jobs)
      .set({
        status: "FAILED",
        lockedAt: null,
        lastError: error instanceof Error ? error.name : typeof error,
      })
      .where(eq(jobs.id, job.id));
  }
  return true;
}
async function loadRequest(job: ClaimedJob) {
  const [request] = await db
    .select()
    .from(integrationRequests)
    .where(
      and(
        eq(integrationRequests.id, job.entity_id),
        eq(integrationRequests.organizationId, job.organization_id),
      ),
    )
    .limit(1);
  if (!request)
    throw new AppError("NOT_FOUND", "Integration request not found", 404);
  const [doc] = await db
    .select()
    .from(dispatchDocuments)
    .where(
      and(
        eq(dispatchDocuments.id, request.documentId),
        eq(dispatchDocuments.organizationId, job.organization_id),
      ),
    )
    .limit(1);
  if (!doc) throw new AppError("NOT_FOUND", "Document not found", 404);
  return { request, doc, dto: doc.payload as EotpremnicaDocumentDTO };
}
async function submit(job: ClaimedJob) {
  const { request, doc, dto } = await loadRequest(job);
  if (!["QUEUED", "FAILED_TRANSIENT"].includes(request.state)) return;
  if (request.requestId) {
    await db.insert(jobs).values({
      organizationId: job.organization_id,
      type: "POLL_DOCUMENT",
      entityId: request.id,
      status: "PENDING",
    });
    return;
  }
  const attempt = request.attemptCount + 1;
  const claimed = await db.transaction(async (tx) => {
    const updated = await tx
      .update(integrationRequests)
      .set({
        state: "SUBMITTING",
        attemptCount: attempt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationRequests.id, request.id),
          eq(integrationRequests.organizationId, job.organization_id),
          eq(integrationRequests.state, request.state),
        ),
      )
      .returning({ id: integrationRequests.id });
    if (!updated.length) return false;
    await tx
      .update(shipments)
      .set({
        status: "SUBMITTING",
        documentStatus: "SUBMITTING",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(shipments.id, request.shipmentId),
          eq(shipments.organizationId, job.organization_id),
        ),
      );
    await tx.insert(integrationEvents).values({
      organizationId: job.organization_id,
      requestId: request.id,
      event: "ATTEMPT_STARTED",
      detail: { attempt },
    });
    return true;
  });
  if (!claimed) return;
  try {
    const adapter = getEotpremnicaAdapter();
    const result = await adapter.submitDispatch(
      dto,
      request.idempotencyKey,
      attempt,
    );
    await db.transaction(async (tx) => {
      const completed = await tx
        .update(integrationRequests)
        .set({
          state: "PROCESSING",
          requestId: result.requestId,
          responsePayload: { ...result, demo: adapter.mode === "MOCK" },
          errorCode: null,
          errorMessage: null,
          nextRetryAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(integrationRequests.id, request.id),
            eq(integrationRequests.organizationId, job.organization_id),
            eq(integrationRequests.state, "SUBMITTING"),
            eq(integrationRequests.attemptCount, attempt),
          ),
        )
        .returning({ id: integrationRequests.id });
      if (!completed.length) return;
      await tx
        .update(shipments)
        .set({
          status: "SUBMITTED",
          documentStatus: "PROCESSING",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(shipments.id, request.shipmentId),
            eq(shipments.organizationId, job.organization_id),
          ),
        );
      await tx
        .update(dispatchDocuments)
        .set({ status: "PROCESSING", updatedAt: new Date() })
        .where(eq(dispatchDocuments.id, doc.id));
      await tx.insert(integrationEvents).values({
        organizationId: job.organization_id,
        requestId: request.id,
        event: "SUBMITTED",
        detail: { attempt, requestId: result.requestId, mode: adapter.mode },
      });
      await tx.insert(jobs).values({
        organizationId: job.organization_id,
        type: "POLL_DOCUMENT",
        entityId: request.id,
        status: "PENDING",
        runAt: new Date(Date.now() + Number(process.env.MOCK_DELAY_MS ?? 1200)),
      });
      await tx
        .update(integrationConnections)
        .set({ state: "CONNECTED", lastAttemptAt: new Date() })
        .where(
          and(
            eq(integrationConnections.organizationId, job.organization_id),
            eq(integrationConnections.kind, "EOTPREMNICA"),
          ),
        );
    });
  } catch (error) {
    await handleFailure(job, request, error, attempt);
  }
}
async function poll(job: ClaimedJob) {
  const { request, doc, dto } = await loadRequest(job);
  if (
    !["PROCESSING", "FAILED_TRANSIENT", "QUEUED"].includes(request.state) ||
    !request.requestId
  )
    return;
  try {
    const result = await getEotpremnicaAdapter().getRequestStatus(
      request.requestId,
      dto,
    );
    if (result.state === "PROCESSING") {
      await db.insert(jobs).values({
        organizationId: job.organization_id,
        type: "POLL_DOCUMENT",
        entityId: request.id,
        runAt: new Date(Date.now() + 5000),
      });
      return;
    }
    await db.transaction(async (tx) => {
      const completed = await tx
        .update(integrationRequests)
        .set({
          state: result.state,
          responsePayload: result.payload,
          errorCode: result.code ?? null,
          errorMessage: result.message ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(integrationRequests.id, request.id),
            eq(integrationRequests.organizationId, job.organization_id),
            inArray(integrationRequests.state, [
              "PROCESSING",
              "FAILED_TRANSIENT",
              "QUEUED",
            ]),
          ),
        )
        .returning({ id: integrationRequests.id });
      if (!completed.length) return;
      await tx
        .update(dispatchDocuments)
        .set({
          status: result.state,
          externalDocumentId: result.documentId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(dispatchDocuments.id, doc.id));
      await tx
        .update(shipments)
        .set({
          status: result.state,
          documentStatus: result.state,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(shipments.id, request.shipmentId),
            eq(shipments.organizationId, job.organization_id),
          ),
        );
      await tx.insert(integrationEvents).values({
        organizationId: job.organization_id,
        requestId: request.id,
        event: result.state,
        detail: { code: result.code, documentId: result.documentId },
      });
      await tx.insert(auditEvents).values({
        organizationId: job.organization_id,
        actorId: null,
        action: `document.${result.state.toLowerCase()}`,
        entityType: "document",
        entityId: doc.id,
        summary:
          result.state === "ACCEPTED"
            ? "Mock dispatch accepted"
            : (result.message ?? "Dispatch rejected"),
        metadata: {
          requestId: request.id,
          mode: getEotpremnicaAdapter().mode,
        },
        correlationId: request.correlationId,
      });
      if (result.state === "REJECTED")
        await tx.insert(validationIssues).values({
          organizationId: job.organization_id,
          shipmentId: request.shipmentId,
          requestId: request.id,
          category: "GOVERNMENT_REJECTION",
          code: result.code ?? "REJECTED",
          severity: "ERROR",
          explanation: result.message ?? "Document rejected",
          technicalDetail: JSON.stringify(result.payload),
          recommendedAction:
            "Correct shipment data, revalidate, and prepare a new document.",
        });
      else
        await tx
          .update(validationIssues)
          .set({
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolutionReason: "Submission accepted",
          })
          .where(
            and(
              eq(validationIssues.organizationId, job.organization_id),
              eq(validationIssues.requestId, request.id),
              eq(validationIssues.status, "OPEN"),
            ),
          );
    });
  } catch (error) {
    await handleFailure(job, request, error, request.attemptCount + 1);
  }
}
async function handleFailure(
  job: ClaimedJob,
  request: typeof integrationRequests.$inferSelect,
  error: unknown,
  attempt: number,
) {
  const code =
    error instanceof AppError ? (error.detail ?? error.category) : "UNKNOWN";
  const kind = classifyFailure(
    code,
    error instanceof AppError ? error.status : undefined,
  );
  const retryable = kind === "TRANSIENT" && attempt < job.max_attempts;
  const failedState = kind === "REJECTION" ? "REJECTED" : "FAILED_TRANSIENT";
  const nextRetryAt = retryable
    ? new Date(Date.now() + retryDelayMs(attempt))
    : null;
  const message = error instanceof Error ? error.message : String(error);
  const recorded = await db.transaction(async (tx) => {
    const updated = await tx
      .update(integrationRequests)
      .set({
        state: failedState,
        attemptCount: attempt,
        errorCode: code,
        errorMessage: message,
        nextRetryAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationRequests.id, request.id),
          eq(integrationRequests.organizationId, job.organization_id),
          eq(integrationRequests.attemptCount, job.type === "POLL_DOCUMENT" ? request.attemptCount : attempt),
          inArray(integrationRequests.state, job.type === "POLL_DOCUMENT" ? ["PROCESSING", "FAILED_TRANSIENT", "QUEUED"] : ["SUBMITTING"]),
        ),
      )
      .returning({ id: integrationRequests.id });
    if (!updated.length) return false;
    await tx
      .update(shipments)
      .set({
        status: failedState,
        documentStatus: failedState,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(shipments.id, request.shipmentId),
          eq(shipments.organizationId, job.organization_id),
        ),
      );
    await tx.insert(integrationEvents).values({
      organizationId: job.organization_id,
      requestId: request.id,
      event: "ATTEMPT_FAILED",
      detail: { attempt, code, kind, retryable },
    });
    await tx.insert(validationIssues).values({
      organizationId: job.organization_id,
      shipmentId: request.shipmentId,
      requestId: request.id,
      category:
        kind === "REJECTION" ? "GOVERNMENT_REJECTION" : "INTEGRATION_REQUIRED",
      code: retryable ? code : kind === "TRANSIENT" ? "RETRY_EXHAUSTED" : code,
      severity: "ERROR",
      explanation: message,
      technicalDetail: `Attempt ${attempt}; ${kind}`,
      recommendedAction: retryable
        ? "Automatic retry scheduled. Inspect the request if it persists."
        : kind === "TRANSIENT"
          ? "Retry manually after checking connectivity."
          : kind === "CONFIGURATION"
            ? "Correct integration configuration, then retry."
            : "Correct shipment data before creating a new document.",
      attemptCount: attempt,
      lastRetryAt: new Date(),
    });
    await tx.insert(auditEvents).values({
      organizationId: job.organization_id,
      actorId: null,
      action: "document.failed",
      entityType: "integration_request",
      entityId: request.id,
      summary: message,
      correlationId: request.correlationId,
      metadata: { code, attempt, retryable },
    });
    if (retryable)
      await tx.insert(jobs).values({
        organizationId: job.organization_id,
        type: job.type,
        entityId: request.id,
        status: "PENDING",
        runAt: nextRetryAt!,
        maxAttempts: job.max_attempts,
      });
    return true;
  });
  if (!recorded) return;
  await recordProductEvent({
    name: "document_failed",
    organizationId: job.organization_id,
    actorId: null,
    entityId: request.id,
    entityType: "integration_request",
    correlationId: request.correlationId,
    properties: { code, kind, attempt },
  });
}
