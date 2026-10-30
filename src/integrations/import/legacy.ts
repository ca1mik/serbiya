import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shipments } from "@/db/schema";
import type { ImportSourceAdapter } from "./contracts";
/** Seed-backed demo connector; it never opens an arbitrary external database. */
export class LegacyErpDemoAdapter implements ImportSourceAdapter {
  readonly kind = "LEGACY_ERP";
  constructor(private organizationId: string) {}
  async preview() {
    const rows = await db
      .select()
      .from(shipments)
      .where(
        and(
          eq(shipments.organizationId, this.organizationId),
          eq(shipments.source, "LEGACY_ERP"),
        ),
      )
      .limit(25);
    return rows.map((row) => ({
      externalId: row.externalId ?? "",
      number: row.number,
      recipientName: row.recipientName,
      destination: row.destination ?? "",
      plannedAt: row.plannedAt?.toISOString() ?? "",
    }));
  }
}
