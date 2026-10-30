"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useUiText } from "@/i18n/ui-client";
import {
  groupMappedRows,
  mapRow,
  targetFields,
  type Mapping,
} from "@/domain/mapping";
const suggestions: Record<string, string> = {
  "Broj otpremnice": "number",
  "Eksterni ID": "externalId",
  Kupac: "recipientName",
  "Kupac PIB": "recipientTaxId",
  "Adresa isporuke": "destination",
  "Datum otpreme": "plannedAt",
  "Šifra artikla": "sku",
  Opis: "description",
  Količina: "quantity",
  JM: "unit",
};
const labels: Record<string, string> = {
  externalId: "Eksterni ID",
  number: "Broj otpremnice",
  recipientName: "Kupac",
  recipientTaxId: "Kupac PIB",
  destination: "Adresa isporuke",
  plannedAt: "Datum otpreme",
  senderName: "Pošiljalac",
  shipFrom: "Adresa polaska",
  transport: "Prevoz",
  sku: "Šifra artikla",
  description: "Opis",
  quantity: "Količina",
  unit: "JM",
};
type Template = { id: string; name: string; mapping: Mapping };
export function ImportWizard() {
  const t = useUiText();
  const router = useRouter();
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    id: string;
    imported: number;
    importedShipments: number;
    errors: number;
    rowErrors: { rowNumber: number; error: string | null }[];
  } | null>(null);
  useEffect(() => {
    fetch("/api/mappings")
      .then((r) => r.json())
      .then((data) => setTemplates(data.templates ?? []));
  }, []);
  const validation = useMemo(() => {
    const errors: string[][] = rows.map(() => []);
    for (const group of groupMappedRows(
      rows.map((row) => mapRow(row, mapping)),
    )) {
      const preview = group.errors.slice(0, 3);
      if (group.errors.length > 3) preview.push("…");
      for (const index of group.rowIndexes) errors[index] = preview;
    }
    return errors;
  }, [rows, mapping]);
  const mappedTargets = Object.values(mapping);
  const hasDuplicateTargets =
    new Set(mappedTargets).size !== mappedTargets.length;
  async function preview(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/imports/preview", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(t(data.error?.message ?? "Datoteka nije prihvaćena"));
      setFilename(data.filename);
      setRows(data.rows);
      setHeaders(data.headers);
      setMapping(
        Object.fromEntries(
          data.headers
            .filter((header: string) => suggestions[header])
            .map((header: string) => [header, suggestions[header]]),
        ),
      );
    } catch (cause) {
      setError(t(cause instanceof Error ? cause.message : "Greška uvoza"));
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          rows,
          mapping,
          templateName: templateName || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(t(data.error?.message ?? "Uvoz nije uspeo"));
      setResult(data);
      setRows([]);
      router.refresh();
    } catch (cause) {
      setError(t(cause instanceof Error ? cause.message : "Greška uvoza"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wizard">
      <div className="wizard-steps">
        <span className={rows.length || result ? "active" : ""}>
          {t("1 · Datoteka")}{" "}
        </span>
        <span className={rows.length ? "active" : ""}>
          {t("2 · Mapiranje i provera")}{" "}
        </span>
        <span className={result ? "active" : ""}>{t("3 · Rezultat")}</span>
      </div>
      <div className="upload-zone">
        <strong>{t("CSV ili XLSX, do 2 MB i 500 redova")}</strong>
        <p>
          {t(
            "Datoteka se prvo pregleda. Uvoze se samo redovi sa osnovnim ispravnim podacima.",
          )}{" "}
        </p>
        <label className="button primary">
          {t("Izaberi datoteku")}{" "}
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={preview}
            className="visually-hidden"
          />
        </label>
        <div className="sample-links">
          <a href="/examples/imports/valid_shipments.csv" download>
            {t("Primer CSV")}{" "}
          </a>
          <a href="/examples/imports/shipments_with_errors.csv" download>
            {t("Primer sa greškama")}{" "}
          </a>
          <a href="/examples/imports/valid_shipments.xlsx" download>
            {t("Primer XLSX")}{" "}
          </a>
          <a href="/examples/imports/multiline_shipments.csv" download>
            {t("Primer više stavki CSV")}{" "}
          </a>
        </div>
      </div>
      {busy && (
        <p role="status" className="inline-message">
          {t("Obrada u toku…")}{" "}
        </p>
      )}
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div className="wizard-section-head">
            <div>
              <h2>{filename}</h2>
              <p>
                {rows.length} {t("redova ·")}{" "}
                {validation.filter((x) => x.length === 0).length}{" "}
                {t("za uvoz ·")} {validation.filter((x) => x.length > 0).length}{" "}
                {t("grešaka")}{" "}
              </p>
            </div>
            <select
              aria-label={t("Saved mapping template")}
              defaultValue=""
              onChange={(e) => {
                const template = templates.find((x) => x.id === e.target.value);
                if (template)
                  setMapping(
                    Object.fromEntries(
                      headers
                        .filter((header) => template.mapping[header])
                        .map((header) => [header, template.mapping[header]]),
                    ),
                  );
              }}
            >
              <option value="">{t("Primeni sačuvano mapiranje…")}</option>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mapping-grid">
            <div className="mapping-heading">{t("Izvorna kolona")}</div>
            <div className="mapping-heading">{t("OtpremaOps polje")}</div>
            {headers.map((header) => (
              <div className="mapping-row" key={header}>
                <span>{header}</span>
                <select
                  aria-label={`${t("Map column")} ${header}`}
                  value={mapping[header] ?? ""}
                  onChange={(e) =>
                    setMapping((current) => {
                      const next = { ...current };
                      if (e.target.value)
                        next[header] = e.target
                          .value as (typeof targetFields)[number];
                      else delete next[header];
                      return next;
                    })
                  }
                >
                  <option value="">{t("Ne uvozi")}</option>
                  {targetFields.map((field) => (
                    <option
                      key={field}
                      value={field}
                      disabled={Object.entries(mapping).some(
                        ([source, target]) =>
                          source !== header && target === field,
                      )}
                    >
                      {t(labels[field])}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {hasDuplicateTargets && (
            <p className="form-error" role="alert">
              {t("Svako polje može biti mapirano samo jednom.")}
            </p>
          )}
          <div className="wizard-section-head">
            <div>
              <h3>{t("Pregled redova")}</h3>
              <p>
                {t(
                  "Osnovne greške su prikazane pre uvoza. Poslovna provera se radi na otpremnici.",
                )}{" "}
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Red")}</th>
                  <th>{t("Otpremnica")}</th>
                  <th>{t("Kupac")}</th>
                  <th>{t("SKU")}</th>
                  <th>{t("Količina")}</th>
                  <th>{t("Rezultat")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 12).map((row, i) => {
                  const mapped = mapRow(row, mapping);
                  return (
                    <tr key={i}>
                      <td>{i + 2}</td>
                      <td>{mapped.number || mapped.externalId || "—"}</td>
                      <td>{mapped.recipientName || "—"}</td>
                      <td>{mapped.sku || "—"}</td>
                      <td>{mapped.quantity || "—"}</td>
                      <td>
                        {validation[i].length ? (
                          <span className="danger-text">
                            {t(validation[i].join("; "))}
                          </span>
                        ) : (
                          <span className="success-text">
                            {t("Spremno za uvoz")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="wizard-footer">
            <label>
              {t("Sačuvaj mapiranje kao")}{" "}
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t("Naziv šablona (opciono)")}
              />
            </label>
            <button
              className="button primary"
              disabled={
                busy ||
                hasDuplicateTargets ||
                !validation.some((x) => x.length === 0)
              }
              onClick={commit}
            >
              {t("Uvezi")} {validation.filter((x) => x.length === 0).length}{" "}
              {t("redova")}{" "}
            </button>
          </div>
        </>
      )}
      {result && (
        <div className="result-panel" role="status">
          <strong>{t("Uvoz završen")}</strong>
          <p>
            {result.importedShipments ?? result.imported}{" "}
            {t("otpremnica je kreirano.")} {result.imported} {t("redova")}.{" "}
            {result.errors} {t("redova ima grešku.")}{" "}
          </p>
          {result.rowErrors?.length > 0 && (
            <ul className="import-errors">
              {result.rowErrors.map((row) => (
                <li key={row.rowNumber}>
                  {t("Red")} {row.rowNumber}: {row.error}
                </li>
              ))}
            </ul>
          )}
          <Link href="/shipments" className="button primary">
            {t("Otvori otpremnice")}{" "}
          </Link>
          <Link href={`/imports/${result.id}`} className="button subtle">
            {t("Detalji uvoza")}
          </Link>
        </div>
      )}
    </div>
  );
}
