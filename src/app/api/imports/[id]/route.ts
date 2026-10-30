import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { importJobs, importRows } from "@/db/schema";
import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { safeJson } from "@/lib/security";
export const GET = api(async (request, actor) => {
  const id = request.nextUrl.pathname.split("/").at(-1)!;
  const [job] = await db
    .select()
    .from(importJobs)
    .where(
      and(
        eq(importJobs.id, id),
        eq(importJobs.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!job) throw new AppError("NOT_FOUND", "Import not found", 404);
  const rows = await db
    .select()
    .from(importRows)
    .where(
      and(
        eq(importRows.importJobId, id),
        eq(importRows.organizationId, actor.organizationId),
      ),
    );
  return Response.json(safeJson({ job, rows }));
}, "import:write");
