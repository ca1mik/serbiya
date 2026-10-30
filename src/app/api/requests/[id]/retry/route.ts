import { api } from "@/lib/api";
import { retryRequest } from "@/services/shipment";
export const POST = api(
  async (request, actor) => {
    await retryRequest(actor, request.nextUrl.pathname.split("/").at(-2)!);
    return Response.json({ ok: true });
  },
  "document:send",
  true,
);
