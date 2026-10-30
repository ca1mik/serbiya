import { api } from "@/lib/api";
import { prepareDocument } from "@/services/shipment";
export const POST = api(
  async (request, actor) =>
    Response.json(
      await prepareDocument(actor, request.nextUrl.pathname.split("/").at(-2)!),
    ),
  "document:send",
  true,
);
