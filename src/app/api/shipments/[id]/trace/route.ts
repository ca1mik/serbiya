import { api } from "@/lib/api";
import { shipmentTrace } from "@/services/shipment";
import { safeJson } from "@/lib/security";
import { rolePermissions } from "@/lib/auth";
export const GET = api(async (request, actor) => {
  const trace = await shipmentTrace(
    actor,
    request.nextUrl.pathname.split("/").at(-2)!,
  );
  const permissions = rolePermissions[actor.role] as readonly string[];
  if (permissions.includes("payload:read"))
    return Response.json(safeJson(trace));
  return Response.json(
    safeJson({
      ...trace,
      shipment: { ...trace.shipment, sourceData: {} },
      documents: trace.documents.map((document) => ({
        ...document,
        payload: {},
        xml: "",
      })),
      requests: trace.requests.map((integrationRequest) => ({
        ...integrationRequest,
        requestPayload: {},
        responsePayload: null,
      })),
      issues: trace.issues.map((issue) => ({
        ...issue,
        technicalDetail: null,
      })),
      audit: permissions.includes("audit:read") ? trace.audit : [],
    }),
  );
}, "read");
