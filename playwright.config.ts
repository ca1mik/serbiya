import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    ...devices["Desktop Chrome"],
  },
  reporter: "list",
});
