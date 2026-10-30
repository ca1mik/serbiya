import { z } from "zod";
import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getShipment, updateShipment } from "@/services/shipment";
import { rolePermissions } from "@/lib/auth";
import { safeJson } from "@/lib/security";

const patchSchema = z.object({
  recipientName: z.string().max(200).optional(),
  recipientTaxId: z.string().max(40).optional(),
  destination: z.string().max(500).optional(),
  plannedAt: z.iso.datetime().optional(),
  senderName: z.string().max(200).optional(),
  lines: z
    .array(
      z.object({
        id: z.uuid(),
        sku: z.string().max(100).optional(),
        quantity: z.string().max(40).optional(),
        sourceUnit: z.string().max(40).optional(),
      }),
    )
    .optional(),
});
export const GET = api(async (request, actor) => {
  const result = await getShipment(
    actor,
    request.nextUrl.pathname.split("/").at(-1)!,
  );
  return Response.json(
    safeJson(
      (rolePermissions[actor.role] as readonly string[]).includes("payload:read")
        ? result
        : { ...result, shipment: { ...result.shipment, sourceData: {} } },
    ),
  );
});
export const PATCH = api(
  async (request, actor) => {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new AppError("VALIDATION", "Invalid shipment changes");
    const id = request.nextUrl.pathname.split("/").at(-1)!;
    await updateShipment(actor, id, parsed.data);
    return Response.json(safeJson(await getShipment(actor, id)));
  },
  "shipment:write",
  true,
);
