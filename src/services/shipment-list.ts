import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db/client";
import { shipments } from "@/db/schema";
import type { Actor } from "@/lib/auth";
import { AppError } from "@/lib/errors";

const sortColumns = {
  number: shipments.number,
  status: shipments.status,
  recipientName: shipments.recipientName,
  destination: shipments.destination,
  plannedAt: shipments.plannedAt,
  source: shipments.source,
  documentStatus: shipments.documentStatus,
  updatedAt: shipments.updatedAt,
} as const;

export async function queryShipments(actor: Actor, query: URLSearchParams) {
  const pageParams = [
    "page",
    "pageSize",
    "search",
    "status",
    "source",
    "documentStatus",
    "validation",
    "date",
    "sort",
    "desc",
  ];
  const paginated = pageParams.some((parameter) => query.has(parameter));
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 15);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new AppError("VALIDATION", "Invalid shipment page or page size");

  const conditions: SQL[] = [eq(shipments.organizationId, actor.organizationId)];
  const search = query.get("search")?.trim();
  if (search) {
    if (search.length > 100)
      throw new AppError("VALIDATION", "Search is too long");
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(shipments.number, pattern),
        ilike(shipments.recipientName, pattern),
        ilike(shipments.destination, pattern),
      )!,
    );
  }
  for (const [parameter, column] of [
    ["status", shipments.status],
    ["source", shipments.source],
    ["documentStatus", shipments.documentStatus],
  ] as const) {
    const value = query.get(parameter);
    if (value) {
      if (value.length > 40)
        throw new AppError("VALIDATION", `Invalid ${parameter} filter`);
      conditions.push(eq(column, value));
    }
  }
  const date = query.get("date");
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new AppError("VALIDATION", "Invalid dispatch date");
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date)
      throw new AppError("VALIDATION", "Invalid dispatch date");
    conditions.push(
      gte(shipments.plannedAt, start),
      lt(shipments.plannedAt, new Date(start.getTime() + 86_400_000)),
    );
  }
  const issueCount = sql<number>`(select count(*)::int from validation_issues vi where vi.shipment_id = ${shipments.id} and vi.organization_id = ${actor.organizationId} and vi.status = 'OPEN')`;
  const validation = query.get("validation");
  if (validation && !["issues", "clear"].includes(validation))
    throw new AppError("VALIDATION", "Invalid validation filter");
  if (validation === "issues") conditions.push(sql`${issueCount} > 0`);
  if (validation === "clear") conditions.push(sql`${issueCount} = 0`);

  const sort = query.get("sort") ?? "updatedAt";
  if (sort !== "issueCount" && !(sort in sortColumns))
    throw new AppError("VALIDATION", "Invalid shipment sort");
  const descending = query.get("desc") === null || query.get("desc") === "true";
  if (query.has("desc") && !["true", "false"].includes(query.get("desc")!))
    throw new AppError("VALIDATION", "Invalid sort direction");
  const sortColumn =
    sort === "issueCount"
      ? issueCount
      : sortColumns[sort as keyof typeof sortColumns];
  const where = and(...conditions);
  const rows = await db
    .select({ ...getTableColumns(shipments), issueCount })
    .from(shipments)
    .where(where)
    .orderBy(descending ? desc(sortColumn) : asc(sortColumn), desc(shipments.id))
    .limit(paginated ? pageSize : 500)
    .offset(paginated ? (page - 1) * pageSize : 0);
  if (!paginated) return { paginated, rows, total: rows.length, page, pageSize };
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(shipments)
    .where(where);
  return { paginated, rows, total, page, pageSize };
}
