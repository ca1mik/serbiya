import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 12,
  connectionTimeoutMillis: 5000,
});
// Idle clients can fail outside a query's try/catch (for example on DB restart).
// Handle the event without serializing the error/client and its credentials.
pool.on("error", (error: Error & { code?: string }) => {
  console.error(
    JSON.stringify({
      level: "error",
      operation: "database.idle_connection",
      result: "connection_lost",
      code:
        error.code && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : undefined,
    }),
  );
});
export const db = drizzle(pool, { schema });
