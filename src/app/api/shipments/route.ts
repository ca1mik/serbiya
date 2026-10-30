import { api } from "@/lib/api";
import { rolePermissions } from "@/lib/auth";
import { safeJson } from "@/lib/security";
import { queryShipments } from "@/services/shipment-list";

export const GET = api(async (request, actor) => {
  const result = await queryShipments(actor, request.nextUrl.searchParams);
  const rows = (rolePermissions[actor.role] as readonly string[]).includes(
    "payload:read",
  )
    ? result.rows
    : result.rows.map((row) => ({ ...row, sourceData: {} }));
  return Response.json(
    safeJson(
      result.paginated
        ? {
            rows,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
          }
        : rows,
    ),
  );
});
