import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
export type ProductEventName =
  | "import_started"
  | "import_completed"
  | "shipment_validated"
  | "document_submitted"
  | "document_failed"
  | "exception_resolved";
export type ProductEvent = {
  name: ProductEventName;
  organizationId: string;
  actorId: string | null;
  entityId: string;
  entityType: string;
  correlationId: string;
  properties?: Record<string, unknown>;
};
/** Internal persisted sink. No third-party analytics or network transfer. */
export async function recordProductEvent(event: ProductEvent) {
  await db.insert(auditEvents).values({
    organizationId: event.organizationId,
    actorId: event.actorId,
    action: `analytics.${event.name}`,
    entityType: event.entityType,
    entityId: event.entityId,
    summary: event.name.replaceAll("_", " "),
    metadata: event.properties ?? {},
    correlationId: event.correlationId || randomUUID(),
  });
}
