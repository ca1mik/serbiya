"use client";

import { useUiText } from "@/i18n/ui-client";
const labels: Record<string, string> = {
  NONE: "Nema dokumenta",
  NEEDS_DATA: "Potrebni podaci",
  READY: "Spremno",
  QUEUED: "U redu",
  SUBMITTING: "Slanje",
  SUBMITTED: "Poslato",
  ACCEPTED: "Prihvaćeno",
  REJECTED: "Odbijeno",
  FAILED_TRANSIENT: "Greška slanja",
  FAILED: "Greška",
  DELIVERED: "Isporučeno",
  CANCELLED: "Otkazano",
  IMPORTED: "Uvezeno",
  DRAFT: "Nacrt",
  PROCESSING: "Obrada",
  COMPLETED: "Završeno",
  COMPLETED_WITH_ERRORS: "Završeno sa greškama",
  CONNECTED: "Povezano",
  PENDING: "Nije pripremljeno",
  PREPARED: "Pripremljeno",
};
export function statusLabel(status: string) {
  return labels[status] ?? status;
}
export function StatusBadge({ status }: { status: string }) {
  const t = useUiText();
  const tone = [
    "ACCEPTED",
    "DELIVERED",
    "READY",
    "COMPLETED",
    "CONNECTED",
    "PREPARED",
  ].includes(status)
    ? "success"
    : ["NEEDS_DATA", "IMPORTED", "PROCESSING", "SUBMITTED", "QUEUED"].includes(
          status,
        )
      ? "warning"
      : ["FAILED_TRANSIENT", "REJECTED", "FAILED"].includes(status)
        ? "danger"
        : "neutral";
  return (
    <span className={`status status-${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {t(statusLabel(status))}
    </span>
  );
}
