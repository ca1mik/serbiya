"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./StatusBadge";
import { useUiText } from "@/i18n/ui-client";

type Shipment = {
  id: string;
  number: string;
  status: string;
  preparationState: string;
  documentStatus: string;
  validationVersion: number;
  recipientName: string;
  recipientTaxId: string | null;
  destination: string | null;
  senderName: string;
  shipFrom: string | null;
  plannedAt: string | null;
  transport: string | null;
  source: string;
  externalId: string | null;
  importJobId: string | null;
  sourceData: Record<string, unknown>;
  correlationId: string;
  updatedAt: string;
};
type Line = {
  id: string;
  sku: string;
  description: string;
  quantity: string;
  sourceUnit: string;
  normalizedUnit: string | null;
  batch: string | null;
  weightKg: string | null;
  sourceReference: string | null;
};
type LineDraft = Pick<Line, "id" | "sku" | "quantity" | "sourceUnit">;
type Document = {
  id: string;
  version: number;
  status: string;
  payload: Record<string, unknown>;
  xml: string;
  externalDocumentId: string | null;
  createdAt: string;
};
type Request = {
  id: string;
  state: string;
  requestId: string | null;
  attemptCount: number;
  nextRetryAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown> | null;
  createdAt: string;
};
type IntegrationEvent = {
  id: string;
  event: string;
  detail: Record<string, unknown>;
  createdAt: string;
};
type Issue = {
  id: string;
  code: string;
  explanation: string;
  recommendedAction: string;
  status: string;
  severity: string;
  category: string;
  createdAt: string;
};
type Audit = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};
export type Trace = {
  shipment: Shipment;
  lines: Line[];
  documents: Document[];
  requests: Request[];
  events: IntegrationEvent[];
  issues: Issue[];
  audit: Audit[];
};
const tabs = [
  "Pregled",
  "Stavke",
  "eOtpremnica",
  "Događaji",
  "Sirovi podaci",
  "Dnevnik",
];
function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const t = useUiText();
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="payload-block">
      <div className="payload-head">
        <strong>{label}</strong>
        <button
          className="button subtle"
          onClick={() => navigator.clipboard.writeText(text)}
        >
          {t("Kopiraj")}{" "}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}
export function ShipmentDetail({
  initial,
  canEdit,
  canSend,
  canRaw,
  canPrepare,
  canAudit,
  canImport,
  mode,
}: {
  initial: Trace;
  canEdit: boolean;
  canSend: boolean;
  canRaw: boolean;
  canPrepare: boolean;
  canAudit: boolean;
  canImport: boolean;
  mode: string;
}) {
  const t = useUiText();
  const router = useRouter();
  const [trace, setTrace] = useState(initial);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [recipientTaxId, setRecipientTaxId] = useState(
    trace.shipment.recipientTaxId ?? "",
  );
  const [destination, setDestination] = useState(
    trace.shipment.destination ?? "",
  );
  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>(() =>
    trace.lines.map(({ id, sku, quantity, sourceUnit }) => ({ id, sku, quantity, sourceUnit })),
  );
  function toggleEditor() {
    if (!editing) {
      setRecipientTaxId(trace.shipment.recipientTaxId ?? "");
      setDestination(trace.shipment.destination ?? "");
      setLineDrafts(trace.lines.map(({ id, sku, quantity, sourceUnit }) => ({ id, sku, quantity, sourceUnit })));
    }
    setEditing(!editing);
  }
  function editLine(id: string, field: "sku" | "quantity" | "sourceUnit", value: string) {
    setLineDrafts((current) => current.map((line) =>
      line.id === id ? { ...line, [field]: value } : line,
    ));
  }
  async function refresh() {
    const response = await fetch(`/api/shipments/${trace.shipment.id}/trace`);
    if (response.ok) setTrace(await response.json());
    router.refresh();
  }
  useEffect(() => {
    if (!["QUEUED", "SUBMITTING", "SUBMITTED"].includes(trace.shipment.status))
      return;
    const timer = setInterval(() => {
      void fetch(`/api/shipments/${trace.shipment.id}/trace`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setTrace(data);
        });
    }, 3000);
    return () => clearInterval(timer);
  }, [trace.shipment.status, trace.shipment.id]);
  async function action(name: "validate" | "prepare" | "send") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/shipments/${trace.shipment.id}/${name}`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(t(data.error?.message ?? "Radnja nije uspela"));
      setMessage(
        t(
          name === "validate"
            ? data.valid
              ? "Provera je uspešna."
              : `${data.errors.length} problema zahteva ispravku.`
            : name === "prepare"
              ? "Dokument je pripremljen."
              : "Slanje je u redu za obradu.",
        ),
      );
      await refresh();
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/shipments/${trace.shipment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientTaxId,
          destination,
          lines: lineDrafts.map(({ id, sku, quantity, sourceUnit }) => ({
            id,
            sku: sku.trim(),
            quantity: quantity.trim(),
            sourceUnit: sourceUnit.trim(),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(t(data.error?.message ?? "Neuspešno čuvanje"));
      setEditing(false);
      setMessage(t("Podaci su sačuvani. Pokrenite proveru."));
      await refresh();
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  async function prepareWarehouse() {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/shipments/${trace.shipment.id}/preparation`,
        { method: "POST" },
      );
      const data = await response.json();
      setMessage(t(response.ok ? "Priprema je potvrđena." : (data.error?.message ?? "Greška")));
      await refresh();
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    const request = trace.requests[0];
    if (!request) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/requests/${request.id}/retry`, {
        method: "POST",
      });
      const data = await response.json();
      setMessage(t(response.ok ? "Ponovni pokušaj je zakazan." : (data.error?.message ?? "Greška")));
      await refresh();
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    const question = "Otkažite ovu neposlatu otpremnicu?";
    if (!window.confirm(t(question))) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/shipments/${trace.shipment.id}/cancel`, {
        method: "POST",
      });
      const data = await response.json();
      setMessage(t(response.ok ? "Otpremnica je otkazana." : (data.error?.message ?? "Greška")));
      await refresh();
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  async function mapUnit(sourceUnit: string) {
    const unit = sourceUnit.trim();
    if (!unit) return;
    setBusy(true);
    try {
      const response = await fetch("/api/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "unit",
          sourceUnit: unit,
          normalizedUnit: unit.toUpperCase(),
        }),
      });
      const data = await response.json();
      setMessage(t(response.ok
        ? `Mapiranje ${unit} → ${unit.toUpperCase()} je sačuvano. Ponovo proverite otpremnicu.`
        : (data.error?.message ?? "Greška")));
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  function download(xml: string, filename: string) {
    const url = URL.createObjectURL(
      new Blob([xml], { type: "application/xml;charset=utf-8" }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  const s = trace.shipment;
  const request = trace.requests[0];
  const document = trace.documents.find(
    (d) => d.version === s.validationVersion,
  );
  return (
    <>
      <div className="detail-back">
        <Link href="/shipments">{t("← Otpremnice")}</Link>
        <span>/ {s.number}</span>
      </div>
      <div className="page-head detail-head">
        <div>
          <div className="eyebrow">
            {t("OTPREMNICA ·")} {s.source}
          </div>
          <h1>
            {s.number} <StatusBadge status={s.status} />
          </h1>
          <p>
            {s.recipientName} · {s.destination ?? t("Nedostaje adresa")}
          </p>
        </div>
        <div className="detail-actions">
          {canPrepare && s.preparationState === "PENDING" && (
            <button
              className="button subtle"
              disabled={busy}
              onClick={prepareWarehouse}
            >
              {t("Potvrdi pripremu")}{" "}
            </button>
          )}
          {canEdit &&
            ["DRAFT", "IMPORTED", "NEEDS_DATA", "READY", "REJECTED"].includes(
              s.status,
            ) && (
              <button
                className="button subtle"
                disabled={busy}
                onClick={toggleEditor}
              >
                {t(editing ? "Zatvori izmenu" : "Izmeni podatke")}
              </button>
            )}
          {canEdit &&
            ["DRAFT", "IMPORTED", "NEEDS_DATA", "READY", "REJECTED"].includes(
              s.status,
            ) && (
              <button
                className="button subtle"
                disabled={busy}
                onClick={() => action("validate")}
              >
                {t("Proveri")}{" "}
              </button>
            )}
          {canSend && s.status === "READY" && !document && (
            <button
              className="button subtle"
              disabled={busy}
              onClick={() => action("prepare")}
            >
              {t("Pripremi dokument")}{" "}
            </button>
          )}
          {canSend && s.status === "READY" && document && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => action("send")}
            >
              {t("Pošalji")}{" "}
            </button>
          )}
          {canSend && s.status === "FAILED_TRANSIENT" && (
            <button className="button primary" disabled={busy} onClick={retry}>
              {t("Pokušaj ponovo")}{" "}
            </button>
          )}
          {canEdit &&
            ["DRAFT", "IMPORTED", "NEEDS_DATA", "READY"].includes(s.status) && (
              <button
                className="button subtle"
                disabled={busy}
                onClick={cancel}
              >
                {t("Otkaži")}{" "}
              </button>
            )}
          {canRaw && document && (
            <button
              className="button subtle"
              onClick={() => download(document.xml, `${s.number}-DEMO.xml`)}
            >
              {t("Izvezi XML")}{" "}
            </button>
          )}
        </div>
      </div>
      {message && (
        <div role="status" className="inline-message">
          {message}
        </div>
      )}
      {editing && (
        <section className="work-panel edit-panel">
          <h2>{t("Ispravi podatke")}</h2>
          <div className="form-grid">
            <label>
              {t("PIB primaoca")}{" "}
              <input
                value={recipientTaxId}
                onChange={(e) => setRecipientTaxId(e.target.value)}
              />
            </label>
            <label>
              {t("Adresa isporuke")}{" "}
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </label>
          </div>
          <h3>{t("Stavke")}</h3>
          <div className="line-editor-list">
            {lineDrafts.map((line, index) => (
              <div className="line-editor" key={line.id}>
                <strong>{t("Stavka")} {index + 1} · {trace.lines[index]?.description}</strong>
                <div className="form-grid">
                  <label>
                    {t("Šifra artikla")}
                    <input value={line.sku} onChange={(e) => editLine(line.id, "sku", e.target.value)} />
                  </label>
                  <label>
                    {t("Količina")}
                    <input value={line.quantity} onChange={(e) => editLine(line.id, "quantity", e.target.value)} />
                  </label>
                  <label>
                    {t("Izvorna jedinica")}
                    <input value={line.sourceUnit} onChange={(e) => editLine(line.id, "sourceUnit", e.target.value)} />
                  </label>
                </div>
                <button
                  className="button subtle"
                  disabled={busy || !line.sourceUnit.trim()}
                  onClick={() => mapUnit(line.sourceUnit)}
                >
                  {t("Mapiraj jedinicu:")} {line.sourceUnit || "—"}
                </button>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button className="button primary" disabled={busy} onClick={save}>
              {t("Sačuvaj izmene")}{" "}
            </button>
          </div>
        </section>
      )}
      <div className="detail-meta">
        <div>
          <span>{t("Kupac")}</span>
          <strong>{s.recipientName}</strong>
        </div>
        <div>
          <span>{t("Planirana otprema")}</span>
          <strong>
            {s.plannedAt ? new Date(s.plannedAt).toLocaleString("sr-RS") : "—"}
          </strong>
        </div>
        <div>
          <span>{t("Izvorni ID")}</span>
          <strong>{s.externalId ?? "—"}</strong>
        </div>
        {s.importJobId && canImport && (
          <div>
            <span>{t("Izvorni uvoz")}</span>
            <strong><Link href={`/imports/${s.importJobId}`}>{t("Otvori izvorni uvoz")}</Link></strong>
          </div>
        )}
        <div>
          <span>{t("eOtpremnica")}</span>
          <strong>
            <StatusBadge status={s.documentStatus} />
          </strong>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label={t("Shipment sections")}>
        {tabs.map((label, index) =>
          (index === 4 && !canRaw) || (index === 5 && !canAudit) ? null : (
            <button
              key={label}
              role="tab"
              aria-selected={tab === index}
              className={tab === index ? "active" : ""}
              onClick={() => setTab(index)}
            >
              {t(label)}
            </button>
          ),
        )}
      </div>
      <section className="work-panel detail-panel">
        {tab === 0 && (
          <>
            <h2>{t("Pregled")}</h2>
            <div className="info-grid">
              <div>
                <span>{t("Pošiljalac")}</span>
                <strong>{s.senderName}</strong>
              </div>
              <div>
                <span>{t("Primalac")}</span>
                <strong>{s.recipientName}</strong>
              </div>
              <div>
                <span>{t("PIB primaoca")}</span>
                <strong>{s.recipientTaxId ?? t("Nedostaje")}</strong>
              </div>
              <div>
                <span>{t("Iz magacina")}</span>
                <strong>{s.shipFrom ?? "—"}</strong>
              </div>
              <div>
                <span>{t("Na adresu")}</span>
                <strong>{s.destination ?? t("Nedostaje")}</strong>
              </div>
              <div>
                <span>{t("Prevoz")}</span>
                <strong>{s.transport ?? "—"}</strong>
              </div>
              <div>
                <span>{t("Correlation ID")}</span>
                <code>{s.correlationId}</code>
              </div>
            </div>
            <h3>{t("Provera podataka")}</h3>
            {trace.issues.filter((x) => x.status === "OPEN").length ? (
              <div className="issue-list">
                {trace.issues
                  .filter((x) => x.status === "OPEN")
                  .map((issue) => (
                    <div key={issue.id} className="issue-row">
                      <span className="issue-icon">!</span>
                      <div>
                        <strong>{t(issue.explanation)}</strong>
                        <p>{t(issue.recommendedAction)}</p>
                        <small>
                          {issue.category} · {issue.code}
                        </small>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="muted">{t("Nema otvorenih problema.")}</p>
            )}
          </>
        )}
        {tab === 1 && (
          <>
            <h2>{t("Stavke")}</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("SKU")}</th>
                    <th>{t("Opis")}</th>
                    <th>{t("Količina")}</th>
                    <th>{t("Jedinica")}</th>
                    <th>{t("Serija")}</th>
                    <th>{t("Težina")}</th>
                    <th>{t("Izvorna referenca")}</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <strong>{line.sku}</strong>
                      </td>
                      <td>{line.description}</td>
                      <td>{line.quantity}</td>
                      <td>
                        {line.normalizedUnit ?? (
                          <span className="danger-text">
                            {line.sourceUnit} {t("· bez mapiranja")}{" "}
                          </span>
                        )}
                      </td>
                      <td>{line.batch ?? "—"}</td>
                      <td>{line.weightKg ?? "—"}</td>
                      <td>{line.sourceReference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 2 && (
          <>
            <h2>{t("eOtpremnica")}</h2>
            <div className="info-grid">
              <div>
                <span>{t("Režim")}</span>
                <strong>{mode.toUpperCase()}</strong>
              </div>
              <div>
                <span>{t("Status dokumenta")}</span>
                <strong>
                  <StatusBadge status={s.documentStatus} />
                </strong>
              </div>
              <div>
                <span>{t("Request ID")}</span>
                <code>{request?.requestId ?? "—"}</code>
              </div>
              <div>
                <span>{t("Document ID")}</span>
                <code>{document?.externalDocumentId ?? "—"}</code>
              </div>
              <div>
                <span>{t("Pokušaja")}</span>
                <strong>{request?.attemptCount ?? 0}</strong>
              </div>
              <div>
                <span>{t("Sledeći pokušaj")}</span>
                <strong>
                  {request?.nextRetryAt
                    ? new Date(request.nextRetryAt).toLocaleString("sr-RS")
                    : "—"}
                </strong>
              </div>
            </div>
            {request?.errorMessage && (
              <div className="form-error">{t(request.errorMessage)}</div>
            )}
            {mode.toLowerCase() === "mock" && (
              <p className="muted">
                {t("Mock režim ne komunicira sa državnim sistemom Republike Srbije.")}
              </p>
            )}
          </>
        )}
        {tab === 3 && (
          <>
            <h2>{t("Događaji integracije")}</h2>
            <div className="timeline">
              {trace.events.map((event) => (
                <div key={event.id}>
                  <span>
                    {new Date(event.createdAt).toLocaleString("sr-RS")}
                  </span>
                  <strong>{event.event}</strong>
                  <p>{JSON.stringify(event.detail)}</p>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 4 && canRaw && (
          <>
            <h2>{t("Sirovi podaci")}</h2>
            <p className="muted">
              {t(
                "Podaci su redigovani za tajne. Izlazni XML koristi isključivo internu demo šemu.",
              )}{" "}
            </p>
            <div className="payload-grid">
              <JsonBlock label="SOURCE" value={s.sourceData} />
              <JsonBlock
                label="NORMALIZED"
                value={{ shipment: s, lines: trace.lines }}
              />
              <JsonBlock label="OUTBOUND" value={document?.payload ?? {}} />
              <JsonBlock
                label="RESPONSE"
                value={request?.responsePayload ?? {}}
              />
            </div>
            {document && (
              <div className="payload-block">
                <div className="payload-head">
                  <strong>{t("XML · DEMO")}</strong>
                  <button
                    className="button subtle"
                    onClick={() =>
                      download(document.xml, `${s.number}-DEMO.xml`)
                    }
                  >
                    {t("Preuzmi")}{" "}
                  </button>
                </div>
                <pre>{document.xml}</pre>
              </div>
            )}
          </>
        )}
        {tab === 5 && (
          <>
            <h2>{t("Dnevnik aktivnosti")}</h2>
            <div className="timeline">
              {trace.audit.map((event) => (
                <div key={event.id}>
                  <span>
                    {new Date(event.createdAt).toLocaleString("sr-RS")}
                  </span>
                  <strong>{event.action}</strong>
                  <p>{t(event.summary)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
