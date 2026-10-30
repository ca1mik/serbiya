import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

// Never let test writes reach the application's database loaded from .env.
// Integration tests require a separate, explicitly opted-in connection.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 20000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
