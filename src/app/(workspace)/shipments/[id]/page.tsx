import { notFound } from "next/navigation";
import { requireActor, rolePermissions } from "@/lib/auth";
import { shipmentTrace } from "@/services/shipment";
import { ShipmentDetail, type Trace } from "@/components/ShipmentDetail";
import { AppError } from "@/lib/errors";
import { safeJson } from "@/lib/security";
export default async function ShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  let trace;
  try {
    trace = await shipmentTrace(actor, id);
  } catch (error) {
    if (error instanceof AppError && error.category === "NOT_FOUND") notFound();
    throw error;
  }
  const permissions = rolePermissions[actor.role] as readonly string[];
  const canRaw = permissions.includes("payload:read");
  const canAudit = permissions.includes("audit:read");
  const safeTrace = safeJson(JSON.parse(
    JSON.stringify(
      canRaw
        ? trace
        : {
            ...trace,
            shipment: { ...trace.shipment, sourceData: {} },
            documents: trace.documents.map((d) => ({
              ...d,
              payload: {},
              xml: "",
            })),
            requests: trace.requests.map((r) => ({
              ...r,
              requestPayload: {},
              responsePayload: null,
            })),
            audit: canAudit ? trace.audit : [],
          },
    ),
  )) as Trace;
  return (
    <ShipmentDetail
      initial={safeTrace}
      canEdit={permissions.includes("shipment:write")}
      canSend={permissions.includes("document:send")}
      canRaw={canRaw}
      canPrepare={permissions.includes("preparation:write")}
      canAudit={canAudit}
      canImport={permissions.includes("import:write")}
      mode={process.env.EOTPREMNICA_MODE ?? "mock"}
    />
  );
}
