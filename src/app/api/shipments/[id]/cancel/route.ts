import { api } from "@/lib/api";
import { cancelShipment } from "@/services/shipment";
export const POST = api(
  async (request, actor) => {
    await cancelShipment(actor, request.nextUrl.pathname.split("/").at(-2)!);
    return Response.json({ ok: true });
  },
  "shipment:write",
  true,
);
