import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { AppError } from "./errors";

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL;
  if (origin && expected && new URL(origin).origin !== new URL(expected).origin)
    throw new AppError("AUTHORIZATION", "Invalid request origin", 403);
}
export function safeJson(value: unknown): unknown {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return null;
  if (Array.isArray(value)) return value.map(safeJson);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "toJSON")
        .map(([key, v]) => [
        key,
        /secret|password|passwd|lozinka|token|api.?key|authorization|credential/i.test(key)
          ? "[REDACTED]"
          : safeJson(v),
        ]),
    );
  return value;
}
