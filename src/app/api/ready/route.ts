import { pool } from "@/db/client";
export async function GET() {
  try {
    const result = await pool.query<{ healthy: boolean }>(
      "select exists(select 1 from worker_heartbeats where name='primary' and updated_at > now() - interval '30 seconds') as healthy",
    );
    const worker = result.rows[0]?.healthy ?? false;
    return Response.json(
      { ok: worker, database: true, worker },
      { status: worker ? 200 : 503 },
    );
  } catch {
    return Response.json({ ok: false, database: false }, { status: 503 });
  }
}
