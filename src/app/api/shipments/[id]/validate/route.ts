import { api } from "@/lib/api";
import { validateAndSave } from "@/services/shipment";
export const POST = api(
  async (request, actor) =>
    Response.json(
      await validateAndSave(actor, request.nextUrl.pathname.split("/").at(-2)!),
    ),
  "shipment:write",
  true,
);
