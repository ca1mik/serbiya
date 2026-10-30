export type FailureKind = "TRANSIENT" | "CONFIGURATION" | "REJECTION";
export function classifyFailure(code: string, status?: number): FailureKind {
  if (
    code === "AUTH" ||
    code === "CONFIGURATION" ||
    status === 401 ||
    status === 403
  )
    return "CONFIGURATION";
  if (
    code === "TIMEOUT" ||
    code === "NETWORK" ||
    status === 429 ||
    (status !== undefined && status >= 500)
  )
    return "TRANSIENT";
  if (status === 400 || status === 422) return "REJECTION";
  return "TRANSIENT";
}
export function retryDelayMs(attempt: number) {
  return Math.min(15 * 60_000, 10_000 * 2 ** Math.max(0, attempt - 1));
}
