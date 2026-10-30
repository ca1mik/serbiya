import { recoverStaleJobs, runOneJob } from "./queue";
import { pool } from "@/db/client";

let stopping = false;
let lastRecovery = 0;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function main() {
  console.info(
    JSON.stringify({ level: "info", operation: "worker.start", result: "ok" }),
  );
  while (!stopping) {
    try {
      if (Date.now() - lastRecovery > 30_000) {
        const recovered = await recoverStaleJobs();
        if (recovered)
          console.warn(
            JSON.stringify({
              level: "warn",
              operation: "jobs.recovered",
              count: recovered,
            }),
          );
        lastRecovery = Date.now();
      }
      await pool.query(
        "INSERT INTO worker_heartbeats(name,updated_at) VALUES('primary',now()) ON CONFLICT(name) DO UPDATE SET updated_at=now()",
      );
      if (!(await runOneJob()))
        await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          operation: "worker.loop",
          errorType: error instanceof Error ? error.name : typeof error,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  await pool.end();
}
void main();
