import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/db/client";

await migrate(db, { migrationsFolder: "./drizzle" });
await pool.end();
console.info("Migrations applied");
