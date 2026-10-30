import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { importJobs, importRows, shipments } from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { safeJson } from "@/lib/security";
import { StatusBadge } from "@/components/StatusBadge";
import { serverUiText } from "@/i18n/server";

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor("import:write");
  const t = await serverUiText();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    notFound();

  const [job] = await db
    .select()
    .from(importJobs)
    .where(
      and(
        eq(importJobs.id, id),
        eq(importJobs.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!job) notFound();

  const rows = await db
    .select({ row: importRows, shipmentNumber: shipments.number })
    .from(importRows)
    .leftJoin(
      shipments,
      and(
        eq(shipments.id, importRows.shipmentId),
        eq(shipments.organizationId, actor.organizationId),
      ),
    )
    .where(
      and(
        eq(importRows.organizationId, actor.organizationId),
        eq(importRows.importJobId, job.id),
      ),
    )
    .orderBy(asc(importRows.rowNumber));

  return (
    <>
      <div className="detail-back">
        <Link href="/imports">{t("← Uvozi")}</Link>
        <span>/ {job.filename}</span>
      </div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("Prethodni uvozi")}</div>
          <h1>{t("Detalji uvoza")}</h1>
          <p>{t("Uvezeni redovi i greške ovog pokušaja.")}</p>
        </div>
      </div>
      <div className="detail-meta">
        <div><span>{t("Datoteka")}</span><strong>{job.filename}</strong></div>
        <div><span>{t("Status")}</span><strong><StatusBadge status={job.status} /></strong></div>
        <div><span>{t("Redova")}</span><strong>{job.totalRows}</strong></div>
        <div><span>{t("Uvezeno")}</span><strong>{job.importedRows}</strong></div>
        <div><span>{t("Greške")}</span><strong>{job.errorRows}</strong></div>
        <div><span>{t("Datum")}</span><strong>{job.createdAt.toLocaleString("sr-RS")}</strong></div>
        <div><span>{t("Correlation ID")}</span><code>{job.correlationId}</code></div>
      </div>
      <section className="work-panel table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Red")}</th>
                <th>{t("Rezultat")}</th>
                <th>{t("Otpremnica")}</th>
                <th>{t("Greške")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row, shipmentNumber }) => (
                <tr key={row.id}>
                  <td>{row.rowNumber}</td>
                  <td>
                    <span className={row.error ? "danger-text" : "success-text"}>
                      {t(row.error ? "Red nije uvezen" : "Uvezeno bez greške")}
                    </span>
                  </td>
                  <td>
                    {row.shipmentId ? (
                      <Link className="row-link" href={`/shipments/${row.shipmentId}`}>
                        {shipmentNumber ?? row.shipmentId.slice(0, 8)}
                      </Link>
                    ) : "—"}
                  </td>
                  <td>
                    {row.error ? (
                      <>
                        <span>{t(row.error)}</span>
                        <details>
                          <summary>{t("Izvorni podaci (tajne su skrivene)")}</summary>
                          <pre>{JSON.stringify(safeJson(row.sourceData), null, 2)}</pre>
                        </details>
                      </>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="empty-state">{t("U ovom uvozu nema redova.")}</div>
        )}
      </section>
    </>
  );
}
