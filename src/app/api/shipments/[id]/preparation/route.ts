import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, shipments } from "@/db/schema";
import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
export const POST = api(
  async (request, actor) => {
    const id = request.nextUrl.pathname.split("/").at(-2)!;
    const [shipment] = await db
      .update(shipments)
      .set({ preparationState: "PREPARED", updatedAt: new Date() })
      .where(
        and(
          eq(shipments.id, id),
          eq(shipments.organizationId, actor.organizationId),
          eq(shipments.preparationState, "PENDING"),
        ),
      )
      .returning();
    if (!shipment)
      throw new AppError(
        "CONFLICT",
        "Shipment is already prepared or unavailable",
        409,
      );
    await db.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "shipment.prepared",
      entityType: "shipment",
      entityId: id,
      summary: "Warehouse preparation confirmed",
      correlationId: shipment.correlationId,
    });
    return Response.json({ preparationState: shipment.preparationState });
  },
  "preparation:write",
  true,
);
