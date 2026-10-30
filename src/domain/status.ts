import { AppError } from "@/lib/errors";

export const shipmentStatuses = [
  "DRAFT",
  "IMPORTED",
  "NEEDS_DATA",
  "READY",
  "QUEUED",
  "SUBMITTING",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "FAILED_TRANSIENT",
  "CANCELLED",
  "DELIVERED",
] as const;
export type ShipmentStatus = (typeof shipmentStatuses)[number];
const transitions: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  DRAFT: ["IMPORTED", "NEEDS_DATA", "READY", "CANCELLED"],
  IMPORTED: ["NEEDS_DATA", "READY", "CANCELLED"],
  NEEDS_DATA: ["READY", "CANCELLED"],
  READY: ["NEEDS_DATA", "QUEUED", "CANCELLED"],
  QUEUED: ["SUBMITTING", "CANCELLED"],
  SUBMITTING: ["SUBMITTED", "FAILED_TRANSIENT", "REJECTED"],
  SUBMITTED: ["ACCEPTED", "REJECTED", "FAILED_TRANSIENT"],
  ACCEPTED: ["DELIVERED", "CANCELLED"],
  REJECTED: ["NEEDS_DATA", "READY", "CANCELLED"],
  FAILED_TRANSIENT: ["QUEUED", "CANCELLED"],
  CANCELLED: [],
  DELIVERED: [],
};
export function assertTransition(from: ShipmentStatus, to: ShipmentStatus) {
  if (from === to) return;
  if (!transitions[from]?.includes(to))
    throw new AppError(
      "CONFLICT",
      `Cannot move shipment from ${from} to ${to}`,
      409,
    );
}
export function attentionPriority(
  status: ShipmentStatus,
  plannedAt: Date | null,
  issueCode?: string,
) {
  if (status === "FAILED_TRANSIENT" && issueCode === "RETRY_EXHAUSTED")
    return 0;
  if (status === "FAILED_TRANSIENT") return 1;
  if (
    status === "NEEDS_DATA" &&
    plannedAt &&
    plannedAt.getTime() < Date.now() + 86400000
  )
    return 2;
  if (status === "REJECTED") return 3;
  if (
    status === "SUBMITTED" &&
    plannedAt &&
    plannedAt.getTime() < Date.now() - 3600000
  )
    return 4;
  if (status === "NEEDS_DATA") return 5;
  return 9;
}
