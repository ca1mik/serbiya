import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { getOperationsOverview } from "@/services/operations";
import { serverDictionary, serverUiText } from "@/i18n/server";
import { StatusBadge } from "@/components/StatusBadge";
export default async function OperationsPage() {
  const actor = await requireActor();
  const integrationMode = (
    process.env.EOTPREMNICA_MODE ?? "mock"
  ).toLowerCase();
  const canImport = ["OWNER", "ADMIN", "OPERATIONS"].includes(actor.role);
  const d = await serverDictionary();
  const t = await serverUiText();
  const { counts, queue, issuesByShipment: byShipment } = await getOperationsOverview(actor);
  const counters = [
    {
      label: d.ready,
      value: counts.ready,
      tone: "default",
    },
    {
      label: d.attention,
      value: counts.attention,
      tone: "warn",
    },
    {
      label: d.processing,
      value: counts.processing,
      tone: "default",
    },
    {
      label: d.failed,
      value: counts.failed,
      tone: "fail",
    },
    {
      label: d.completedToday,
      value: counts.completedToday,
      tone: "good",
    },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {t("RADNI RED /")} {new Date().toLocaleDateString("sr-RS")}
          </div>
          <h1>{d.operations}</h1>
          <p>{t("Otpremnice i dokumenti koji zahtevaju pažnju")}</p>
        </div>
        {canImport && (
          <Link className="button primary" href="/imports">
            {t("+ Novi uvoz")}{" "}
          </Link>
        )}
      </div>
      <div className="counter-strip">
        {counters.map((x) => (
          <div key={x.label} className={`counter counter-${x.tone}`}>
            <span>{x.label}</span>
            <strong>{x.value}</strong>
          </div>
        ))}
      </div>
      <section className="work-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("Operativni red")}</h2>
            <p>
              {t(
                "Prioritet: neuspešna integracija, blokirana današnja otprema, odbijen dokument, dugo čekanje.",
              )}{" "}
            </p>
          </div>
          <Link href="/shipments" className="text-link">
            {t("Sve otpremnice →")}{" "}
          </Link>
        </div>
        <div className="table-scroll operations-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Status")}</th>
                <th>{t("Otpremnica")}</th>
                <th>{t("Kupac")}</th>
                <th>{t("Odredište")}</th>
                <th>{t("Planirana otprema")}</th>
                <th>{t("Izvor")}</th>
                <th>{t("eOtpremnica")}</th>
                <th>{t("Problem")}</th>
                <th>{t("Ažurirano")}</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.id}>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    <Link href={`/shipments/${row.id}`} className="row-link">
                      {row.number}
                    </Link>
                  </td>
                  <td>{row.recipientName}</td>
                  <td className="truncate-cell">{row.destination ?? "—"}</td>
                  <td>{row.plannedAt?.toLocaleDateString("sr-RS") ?? "—"}</td>
                  <td>
                    <span className="source-tag">{row.source}</span>
                  </td>
                  <td>
                    <StatusBadge status={row.documentStatus} />
                  </td>
                  <td className="issue-cell">
                    {t(
                      byShipment.get(row.id)?.[0]?.explanation ??
                        (row.status === "SUBMITTED" ? "Čeka se odgovor" : "—"),
                    )}
                  </td>
                  <td>{row.updatedAt.toLocaleDateString("sr-RS")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-queue">
          {queue.slice(0, 8).map((row) => (
            <Link
              className="mobile-queue-row"
              key={row.id}
              href={`/shipments/${row.id}`}
            >
              <div className="mobile-queue-top">
                <strong>{row.number}</strong>
                <StatusBadge status={row.status} />
              </div>
              <div className="mobile-queue-customer">{row.recipientName}</div>
              <div className="mobile-queue-meta">
                {row.destination ?? t("Nedostaje adresa")} ·{" "}
                {row.plannedAt?.toLocaleDateString("sr-RS") ?? "—"}
              </div>
              <p>
                {t(
                  byShipment.get(row.id)?.[0]?.explanation ??
                    "Otvori otpremnicu za detalje",
                )}
              </p>
            </Link>
          ))}
        </div>
      </section>
      <div className="below-grid">
        <section className="work-panel compact-panel">
          <div className="panel-heading">
            <h2>{t("Brze radnje")}</h2>
          </div>
          <div className="quick-actions">
            {canImport ? (
              <Link href="/imports">
                {t("Uvezi CSV / XLSX")} <span>→</span>
              </Link>
            ) : (
              <Link href="/shipments">
                {t("Otvori otpremnice")} <span>→</span>
              </Link>
            )}
            <Link href="/exceptions">
              {t("Otvori greške")} <span>→</span>
            </Link>
            {canImport ? (
              <Link href="/mappings">
                {t("Proveri mapiranja")} <span>→</span>
              </Link>
            ) : (
              <Link href="/documents">
                {t("Otvori dokumente")} <span>→</span>
              </Link>
            )}
          </div>
        </section>
        <section className="work-panel compact-panel">
          <div className="panel-heading">
            <h2>{t("Veza sa sistemom")}</h2>
          </div>
          <div className="system-status">
            <span className="status status-warning">
              <span className="status-dot" />
              {t(
                integrationMode === "mock"
                  ? "DEMO / MOCK"
                  : integrationMode.toUpperCase(),
              )}
            </span>
            <p>
              {t(
                integrationMode === "mock"
                  ? "eOtpremnica zahtevi su simulirani. Nijedan dokument nije poslat državnom sistemu."
                  : "Aktivni režim je konfigurisan na serveru. Detalji adaptera i veze su u Integracijama.",
              )}
            </p>
            <Link href="/integrations" className="text-link">
              {t("Detalji integracije →")}{" "}
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
