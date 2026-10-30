import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  dispatchDocuments,
  integrationEvents,
  integrationRequests,
  jobs,
  shipmentLines,
  shipments,
  unitMappings,
  validationIssues,
} from "@/db/schema";
import { validateShipment } from "@/domain/validation";
import { assertTransition, type ShipmentStatus } from "@/domain/status";
import { submissionKey } from "@/domain/idempotency";
import { AppError } from "@/lib/errors";
import { recordProductEvent } from "@/lib/product-events";
import type { Actor } from "@/lib/auth";
import { getEotpremnicaAdapter } from "@/integrations/eotpremnica/adapters";
import { serializeDemoXml } from "@/integrations/eotpremnica/xml";
import type { EotpremnicaDocumentDTO } from "@/integrations/eotpremnica/types";

export async function getShipment(actor: Actor, id: string) {
  const [shipment] = await db
    .select()
    .from(shipments)
    .where(
      and(
        eq(shipments.id, id),
        eq(shipments.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!shipment) throw new AppError("NOT_FOUND", "Shipment not found", 404);
  const lines = await db
    .select()
    .from(shipmentLines)
    .where(
      and(
        eq(shipmentLines.organizationId, actor.organizationId),
        eq(shipmentLines.shipmentId, id),
      ),
    );
  return { shipment, lines };
}
export async function validateAndSave(actor: Actor, id: string) {
  const { shipment, lines } = await getShipment(actor, id);
  if (
    !["DRAFT", "IMPORTED", "NEEDS_DATA", "READY", "REJECTED"].includes(
      shipment.status,
    )
  )
    throw new AppError(
      "CONFLICT",
      "Shipment cannot be validated in its current state",
      409,
    );
  const mappings = await db
    .select()
    .from(unitMappings)
    .where(eq(unitMappings.organizationId, actor.organizationId));
  const unitBySource = new Map(
    mappings.map((m) => [m.sourceUnit.toLowerCase(), m.normalizedUnit]),
  );
  const normalized = lines.map((line) => ({
    ...line,
    normalizedUnit: unitBySource.get(line.sourceUnit.toLowerCase()) ?? null,
  }));
  const result = validateShipment({ ...shipment, lines: normalized });
  const nextStatus = result.valid ? "READY" : "NEEDS_DATA";
  assertTransition(shipment.status as ShipmentStatus, nextStatus);
  await db.transaction(async (tx) => {
    for (const line of normalized)
      await tx
        .update(shipmentLines)
        .set({ normalizedUnit: line.normalizedUnit })
        .where(
          and(
            eq(shipmentLines.id, line.id),
            eq(shipmentLines.organizationId, actor.organizationId),
            eq(shipmentLines.shipmentId, id),
          ),
        );
    await tx
      .update(validationIssues)
      .set({
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolutionReason: "Revalidated",
      })
      .where(
        and(
          eq(validationIssues.organizationId, actor.organizationId),
          eq(validationIssues.shipmentId, id),
          eq(validationIssues.status, "OPEN"),
          inArray(validationIssues.category, [
            "INTERNAL_REQUIRED",
            "BUSINESS_RULE",
            "INTEGRATION_REQUIRED",
          ]),
        ),
      );
    if (result.errors.length)
      await tx.insert(validationIssues).values(
        result.errors.map((issue) => ({
          organizationId: actor.organizationId,
          shipmentId: id,
          ...issue,
          status: "OPEN",
        })),
      );
    const changed = await tx
      .update(shipments)
      .set({
        status: nextStatus,
        validationVersion: shipment.validationVersion + 1,
        documentStatus:
          shipment.status === "REJECTED" ? "NONE" : shipment.documentStatus,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(shipments.id, id),
          eq(shipments.organizationId, actor.organizationId),
          eq(shipments.status, shipment.status),
        ),
      )
      .returning({ id: shipments.id });
    if (!changed.length)
      throw new AppError(
        "CONFLICT",
        "Shipment changed while validating; reload and retry",
        409,
      );
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "shipment.validated",
      entityType: "shipment",
      entityId: id,
      summary: result.valid
        ? "Shipment passed validation"
        : `${result.errors.length} blocking issues found`,
      metadata: { codes: result.errors.map((x) => x.code) },
      correlationId: shipment.correlationId,
    });
  });
  await recordProductEvent({
    name: "shipment_validated",
    organizationId: actor.organizationId,
    actorId: actor.id,
    entityId: id,
    entityType: "shipment",
    correlationId: shipment.correlationId,
    properties: { valid: result.valid, errors: result.errors.length },
  });
  return result;
}
export async function prepareDocument(actor: Actor, id: string) {
  const { shipment, lines } = await getShipment(actor, id);
  if (shipment.status !== "READY")
    throw new AppError(
      "CONFLICT",
      "Validate the shipment before preparing a document",
      409,
    );
  const existing = await db
    .select()
    .from(dispatchDocuments)
    .where(
      and(
        eq(dispatchDocuments.organizationId, actor.organizationId),
        eq(dispatchDocuments.shipmentId, id),
        eq(dispatchDocuments.version, shipment.validationVersion),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];
  const dto: EotpremnicaDocumentDTO = {
    schema: "otpremaops-demo-v1",
    shipmentNumber: shipment.number,
    sender: shipment.senderName,
    recipient: {
      name: shipment.recipientName,
      taxId: shipment.recipientTaxId ?? "",
    },
    destination: shipment.destination ?? "",
    plannedAt: shipment.plannedAt?.toISOString() ?? "",
    lines: lines.map((line) => ({
      sku: line.sku,
      description: line.description,
      quantity: line.quantity,
      unit: line.normalizedUnit ?? "",
    })),
  };
  const adapter = getEotpremnicaAdapter();
  const payload = await adapter.createDispatchDocument(dto);
  const xml =
    adapter.mode === "MOCK"
      ? serializeDemoXml(dto)
      : await adapter.downloadPayload(dto);
  const [document] = await db
    .insert(dispatchDocuments)
    .values({
      organizationId: actor.organizationId,
      shipmentId: id,
      version: shipment.validationVersion,
      status: "PREPARED",
      payload,
      xml,
    })
    .onConflictDoNothing()
    .returning();
  const saved =
    document ??
    (
      await db
        .select()
        .from(dispatchDocuments)
        .where(
          and(
            eq(dispatchDocuments.organizationId, actor.organizationId),
            eq(dispatchDocuments.shipmentId, id),
            eq(dispatchDocuments.version, shipment.validationVersion),
          ),
        )
        .limit(1)
    )[0];
  if (document)
    await db.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "document.prepared",
      entityType: "document",
      entityId: document.id,
      summary: "Dispatch document prepared",
      correlationId: shipment.correlationId,
    });
  return saved;
}
export async function sendDocument(actor: Actor, id: string) {
  const { shipment } = await getShipment(actor, id);
  if (shipment.status !== "READY" && shipment.status !== "QUEUED")
    throw new AppError("CONFLICT", "Shipment is not ready to send", 409);
  const [doc] = await db
    .select()
    .from(dispatchDocuments)
    .where(
      and(
        eq(dispatchDocuments.organizationId, actor.organizationId),
        eq(dispatchDocuments.shipmentId, id),
        eq(dispatchDocuments.version, shipment.validationVersion),
      ),
    )
    .limit(1);
  if (!doc) throw new AppError("CONFLICT", "Prepare a document first", 409);
  const key = submissionKey(
    actor.organizationId,
    id,
    "submitDispatch",
    doc.version,
    doc.payload,
  );
  const existing = await db
    .select()
    .from(integrationRequests)
    .where(
      and(
        eq(integrationRequests.organizationId, actor.organizationId),
        eq(integrationRequests.idempotencyKey, key),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];
  const [request] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(integrationRequests)
      .values({
        organizationId: actor.organizationId,
        shipmentId: id,
        documentId: doc.id,
        operation: "submitDispatch",
        idempotencyKey: key,
        state: "QUEUED",
        requestPayload: doc.payload,
        correlationId: shipment.correlationId,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0])
      return await tx
        .select()
        .from(integrationRequests)
        .where(
          and(
            eq(integrationRequests.organizationId, actor.organizationId),
            eq(integrationRequests.idempotencyKey, key),
          ),
        )
        .limit(1);
    if (shipment.status === "READY") {
      const changed = await tx
        .update(shipments)
        .set({
          status: "QUEUED",
          documentStatus: "QUEUED",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(shipments.id, id),
            eq(shipments.organizationId, actor.organizationId),
            eq(shipments.status, "READY"),
          ),
        )
        .returning({ id: shipments.id });
      if (!changed.length)
        throw new AppError(
          "CONFLICT",
          "Shipment changed while queuing; reload and retry",
          409,
        );
    } else {
      throw new AppError(
        "CONFLICT",
        "Shipment is already queued without a matching request",
        409,
      );
    }
    await tx.insert(jobs).values({
      organizationId: actor.organizationId,
      type: "SUBMIT_DOCUMENT",
      entityId: inserted[0].id,
      status: "PENDING",
    });
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "document.submitted",
      entityType: "document",
      entityId: doc.id,
      summary: "Submission queued",
      correlationId: shipment.correlationId,
      metadata: { requestId: inserted[0].id },
    });
    return inserted;
  });
  await recordProductEvent({
    name: "document_submitted",
    organizationId: actor.organizationId,
    actorId: actor.id,
    entityId: doc.id,
    entityType: "document",
    correlationId: shipment.correlationId,
    properties: { requestId: request.id },
  });
  return request;
}
export async function updateShipment(
  actor: Actor,
  id: string,
  changes: {
    recipientName?: string;
    recipientTaxId?: string;
    destination?: string;
    plannedAt?: string;
    senderName?: string;
    lines?: {
      id: string;
      sku?: string;
      quantity?: string;
      sourceUnit?: string;
    }[];
  },
) {
  const { shipment } = await getShipment(actor, id);
  if (
    !["DRAFT", "IMPORTED", "NEEDS_DATA", "READY", "REJECTED"].includes(
      shipment.status,
    )
  )
    throw new AppError("CONFLICT", "Shipment cannot be edited now", 409);
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(shipments)
      .set({
        recipientName: changes.recipientName ?? shipment.recipientName,
        recipientTaxId: changes.recipientTaxId ?? shipment.recipientTaxId,
        destination: changes.destination ?? shipment.destination,
        plannedAt: changes.plannedAt
          ? new Date(changes.plannedAt)
          : shipment.plannedAt,
        senderName: changes.senderName ?? shipment.senderName,
        status: "NEEDS_DATA",
        documentStatus: "NONE",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(shipments.id, id),
          eq(shipments.organizationId, actor.organizationId),
          eq(shipments.status, shipment.status),
        ),
      )
      .returning({ id: shipments.id });
    if (!changed.length)
      throw new AppError(
        "CONFLICT",
        "Shipment changed while editing; reload and retry",
        409,
      );
    for (const line of changes.lines ?? []) {
      const updatedLine = await tx
        .update(shipmentLines)
        .set({
          sku: line.sku,
          quantity: line.quantity,
          sourceUnit: line.sourceUnit,
        })
        .where(
          and(
            eq(shipmentLines.id, line.id),
            eq(shipmentLines.organizationId, actor.organizationId),
            eq(shipmentLines.shipmentId, id),
          ),
        )
        .returning({ id: shipmentLines.id });
      if (!updatedLine.length)
        throw new AppError(
          "NOT_FOUND",
          "Shipment line not found in this organization",
          404,
        );
    }
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "shipment.updated",
      entityType: "shipment",
      entityId: id,
      summary: "Shipment data updated",
      correlationId: shipment.correlationId,
    });
  });
}
export async function cancelShipment(actor: Actor, id: string) {
  const { shipment } = await getShipment(actor, id);
  if (!["DRAFT", "IMPORTED", "NEEDS_DATA", "READY"].includes(shipment.status))
    throw new AppError(
      "CONFLICT",
      "Only an unsent shipment can be cancelled here",
      409,
    );
  assertTransition(shipment.status as ShipmentStatus, "CANCELLED");
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(shipments)
      .set({
        status: "CANCELLED",
        documentStatus: "CANCELLED",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(shipments.id, id),
          eq(shipments.organizationId, actor.organizationId),
          eq(shipments.status, shipment.status),
        ),
      )
      .returning({ id: shipments.id });
    if (!changed.length)
      throw new AppError(
        "CONFLICT",
        "Shipment changed while cancelling; reload and retry",
        409,
      );
    await tx
      .update(validationIssues)
      .set({
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolutionReason: "Shipment cancelled",
      })
      .where(
        and(
          eq(validationIssues.organizationId, actor.organizationId),
          eq(validationIssues.shipmentId, id),
          eq(validationIssues.status, "OPEN"),
        ),
      );
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "shipment.cancelled",
      entityType: "shipment",
      entityId: id,
      summary: "Unsent shipment cancelled",
      correlationId: shipment.correlationId,
    });
  });
}
export async function retryRequest(actor: Actor, requestId: string) {
  const [request] = await db
    .select()
    .from(integrationRequests)
    .where(
      and(
        eq(integrationRequests.id, requestId),
        eq(integrationRequests.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!request) throw new AppError("NOT_FOUND", "Request not found", 404);
  if (request.state !== "FAILED_TRANSIENT" && request.state !== "REJECTED")
    throw new AppError(
      "CONFLICT",
      "Only failed or rejected requests can be retried",
      409,
    );
  if (request.state === "REJECTED")
    throw new AppError(
      "CONFLICT",
      "Correct and revalidate shipment data, then prepare a new document",
      409,
    );
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(integrationRequests)
      .set({ state: "QUEUED", nextRetryAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(integrationRequests.id, requestId),
          eq(integrationRequests.organizationId, actor.organizationId),
          eq(integrationRequests.state, "FAILED_TRANSIENT"),
        ),
      )
      .returning({ id: integrationRequests.id });
    if (!changed.length)
      throw new AppError("CONFLICT", "Request was already retried", 409);
    await tx
      .update(shipments)
      .set({
        status: "QUEUED",
        documentStatus: "QUEUED",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(shipments.id, request.shipmentId),
          eq(shipments.organizationId, actor.organizationId),
        ),
      );
    await tx.insert(jobs).values({
      organizationId: actor.organizationId,
      type: request.requestId ? "POLL_DOCUMENT" : "SUBMIT_DOCUMENT",
      entityId: requestId,
      status: "PENDING",
    });
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "retry.requested",
      entityType: "integration_request",
      entityId: requestId,
      summary: "Manual retry queued",
      correlationId: request.correlationId,
    });
  });
}
export async function shipmentTrace(actor: Actor, id: string) {
  const { shipment, lines } = await getShipment(actor, id);
  const documents = await db
    .select()
    .from(dispatchDocuments)
    .where(
      and(
        eq(dispatchDocuments.organizationId, actor.organizationId),
        eq(dispatchDocuments.shipmentId, id),
      ),
    )
    .orderBy(desc(dispatchDocuments.createdAt));
  const requests = await db
    .select()
    .from(integrationRequests)
    .where(
      and(
        eq(integrationRequests.organizationId, actor.organizationId),
        eq(integrationRequests.shipmentId, id),
      ),
    )
    .orderBy(desc(integrationRequests.createdAt));
  const events = requests.length
    ? await db
        .select()
        .from(integrationEvents)
        .where(
          and(
            eq(integrationEvents.organizationId, actor.organizationId),
            inArray(
              integrationEvents.requestId,
              requests.map((r) => r.id),
            ),
          ),
        )
        .orderBy(desc(integrationEvents.createdAt))
    : [];
  const issues = await db
    .select()
    .from(validationIssues)
    .where(
      and(
        eq(validationIssues.organizationId, actor.organizationId),
        eq(validationIssues.shipmentId, id),
      ),
    )
    .orderBy(desc(validationIssues.createdAt));
  const audit = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, actor.organizationId),
        eq(auditEvents.correlationId, shipment.correlationId),
      ),
    )
    .orderBy(desc(auditEvents.createdAt));
  return { shipment, lines, documents, requests, events, issues, audit };
}
