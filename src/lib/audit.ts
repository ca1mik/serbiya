import "server-only";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import type { Actor } from "./auth";

export async function audit(
  actor: Actor | null,
  organizationId: string,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  correlationId: string,
  metadata: Record<string, unknown> = {},
) {
  await db.insert(auditEvents).values({
    organizationId,
    actorId: actor?.id ?? null,
    action,
    entityType,
    entityId,
    summary,
    correlationId,
    metadata,
  });
}
