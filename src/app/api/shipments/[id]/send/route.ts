import { api } from "@/lib/api";
import { sendDocument } from "@/services/shipment";
export const POST = api(
  async (request, actor) =>
    Response.json(
      await sendDocument(actor, request.nextUrl.pathname.split("/").at(-2)!),
    ),
  "document:send",
  true,
);
