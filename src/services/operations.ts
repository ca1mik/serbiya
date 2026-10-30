import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { shipments, validationIssues } from "@/db/schema";
import type { Actor } from "@/lib/auth";

/** Tenant-wide counters and a bounded queue, ordered before applying the limit. */
export async function getOperationsOverview(actor: Actor) {
  const organization = eq(shipments.organizationId, actor.organizationId);
  const [{ ready, attention, processing, failed, completedToday }] = await db
    .select({
      ready: sql<number>`count(*) filter (where ${shipments.status} = 'READY')::int`,
      attention: sql<number>`count(*) filter (where ${shipments.status} in ('NEEDS_DATA', 'REJECTED'))::int`,
      processing: sql<number>`count(*) filter (where ${shipments.status} in ('QUEUED', 'SUBMITTING', 'SUBMITTED'))::int`,
      failed: sql<number>`count(*) filter (where ${shipments.status} = 'FAILED_TRANSIENT')::int`,
      completedToday: sql<number>`count(*) filter (where ${shipments.status} in ('ACCEPTED', 'DELIVERED') and (${shipments.updatedAt} at time zone 'Europe/Belgrade')::date = (now() at time zone 'Europe/Belgrade')::date)::int`,
    })
    .from(shipments)
    .where(organization);

  const tomorrow = new Date(Date.now() + 86_400_000);
  const stale = new Date(Date.now() - 3_600_000);
  const priority = sql<number>`case
    when ${shipments.status} = 'FAILED_TRANSIENT' and exists (
      select 1 from validation_issues vi
      where vi.organization_id = ${actor.organizationId}
        and vi.shipment_id = ${shipments.id}
        and vi.status = 'OPEN'
        and vi.code = 'RETRY_EXHAUSTED'
    ) then 0
    when ${shipments.status} = 'FAILED_TRANSIENT' then 1
    when ${shipments.status} = 'NEEDS_DATA' and ${shipments.plannedAt} < ${tomorrow} then 2
    when ${shipments.status} = 'REJECTED' then 3
    when ${shipments.status} = 'SUBMITTED' and ${shipments.plannedAt} < ${stale} then 4
    when ${shipments.status} = 'NEEDS_DATA' then 5
    else 9 end`;
  const queue = await db
    .select(getTableColumns(shipments))
    .from(shipments)
    .where(
      and(
        organization,
        inArray(shipments.status, [
          "NEEDS_DATA",
          "FAILED_TRANSIENT",
          "REJECTED",
          "SUBMITTED",
          "IMPORTED",
          "READY",
        ]),
      ),
    )
    .orderBy(
      asc(priority),
      asc(sql`coalesce(${shipments.plannedAt}, 'infinity'::timestamptz)`),
      asc(shipments.id),
    )
    .limit(25);
  const issues = queue.length
    ? await db
        .select()
        .from(validationIssues)
        .where(
          and(
            eq(validationIssues.organizationId, actor.organizationId),
            eq(validationIssues.status, "OPEN"),
            inArray(
              validationIssues.shipmentId,
              queue.map((shipment) => shipment.id),
            ),
          ),
        )
        .orderBy(
          asc(sql`case when ${validationIssues.code} = 'RETRY_EXHAUSTED' then 0 else 1 end`),
          desc(validationIssues.createdAt),
        )
    : [];
  const issuesByShipment = new Map<string, typeof issues>();
  for (const issue of issues) {
    if (!issue.shipmentId) continue;
    const existing = issuesByShipment.get(issue.shipmentId) ?? [];
    existing.push(issue);
    issuesByShipment.set(issue.shipmentId, existing);
  }
  return {
    counts: { ready, attention, processing, failed, completedToday },
    queue,
    issuesByShipment,
  };
}
