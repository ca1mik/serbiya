import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, validationIssues } from "@/db/schema";
import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { recordProductEvent } from "@/lib/product-events";
const schema = z.object({ reason: z.string().min(3).max(300) });
export const POST = api(
  async (request, actor) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      throw new AppError("VALIDATION", "A resolution reason is required");
    const id = request.nextUrl.pathname.split("/").at(-2)!;
    const [issue] = await db
      .update(validationIssues)
      .set({
        status: "RESOLVED",
        resolutionReason: parsed.data.reason,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(validationIssues.id, id),
          eq(validationIssues.organizationId, actor.organizationId),
          eq(validationIssues.status, "OPEN"),
        ),
      )
      .returning();
    if (!issue)
      throw new AppError("NOT_FOUND", "Open exception not found", 404);
    await db.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "exception.resolved",
      entityType: "validation_issue",
      entityId: id,
      summary: parsed.data.reason,
      correlationId: crypto.randomUUID(),
    });
    await recordProductEvent({
      name: "exception_resolved",
      organizationId: actor.organizationId,
      actorId: actor.id,
      entityId: id,
      entityType: "validation_issue",
      correlationId: crypto.randomUUID(),
      properties: { reason: parsed.data.reason },
    });
    return Response.json({ ok: true });
  },
  "shipment:write",
  true,
);
