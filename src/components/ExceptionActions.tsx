"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUiText } from "@/i18n/ui-client";
export function ExceptionActions({
  id,
  requestId,
  code,
}: {
  id: string;
  requestId: string | null;
  code: string;
}) {
  const router = useRouter();
  const t = useUiText();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  async function resolve(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/exceptions/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Greška");
      setMessage(t("Greška je zatvorena."));
      setReasonOpen(false);
      setReason("");
      router.refresh();
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    if (!requestId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/requests/${requestId}/retry`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Greška");
      setMessage(t("Ponovni pokušaj je zakazan."));
      router.refresh();
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="exception-actions">
      {requestId &&
        ["TIMEOUT", "RETRY_EXHAUSTED", "NETWORK"].includes(code) && (
          <button type="button" className="button subtle" disabled={busy} onClick={retry}>
            {t("Pokušaj ponovo")}{" "}
          </button>
        )}
      {!reasonOpen && (
        <button type="button" className="button subtle" disabled={busy} onClick={() => setReasonOpen(true)}>
          {t("Zatvori uz razlog")}
        </button>
      )}
      {reasonOpen && (
        <form className="exception-reason-form" onSubmit={resolve}>
          <label>
            {t("Razlog zatvaranja greške")}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={500} autoFocus />
          </label>
          <div>
            <button type="submit" className="button primary" disabled={busy || reason.trim().length < 3}>
              {t("Potvrdi zatvaranje")}
            </button>
            <button type="button" className="button subtle" disabled={busy} onClick={() => setReasonOpen(false)}>
              {t("Odustani")}
            </button>
          </div>
        </form>
      )}
      {message && <span role="status">{message}</span>}
    </div>
  );
}
