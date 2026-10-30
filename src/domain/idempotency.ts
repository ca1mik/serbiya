import { createHash } from "node:crypto";
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function submissionKey(
  organizationId: string,
  shipmentId: string,
  operation: string,
  version: number,
  payload: unknown,
): string {
  return createHash("sha256")
    .update(
      `${organizationId}:${shipmentId}:${operation}:${version}:${stableJson(payload)}`,
    )
    .digest("hex");
}
