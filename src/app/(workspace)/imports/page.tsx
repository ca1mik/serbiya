import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { importJobs } from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { ImportWizard } from "@/components/ImportWizard";
import { StatusBadge } from "@/components/StatusBadge";
import { serverUiText } from "@/i18n/server";
export default async function ImportsPage() {
  const t = await serverUiText();
  const actor = await requireActor("import:write");
  const history = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.organizationId, actor.organizationId))
    .orderBy(desc(importJobs.createdAt))
    .limit(30);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("PODACI IZ POSTOJEĆIH SISTEMA")}</div>
          <h1>{t("Uvozi")}</h1>
          <p>
            {t(
              "Uvezite izvoz iz ERP-a ili Excela, proverite kolone i nastavite rad.",
            )}{" "}
          </p>
        </div>
      </div>
      <section className="work-panel">
        <ImportWizard />
      </section>
      <section className="work-panel secondary-panel">
        <div className="panel-heading">
          <h2>{t("Prethodni uvozi")}</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Datoteka")}</th>
                <th>{t("Status")}</th>
                <th>{t("Redova")}</th>
                <th>{t("Uvezeno")}</th>
                <th>{t("Greške")}</th>
                <th>{t("Datum")}</th>
                <th>{t("Correlation ID")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link className="row-link" href={`/imports/${job.id}`}>
                      {job.filename}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={job.status} />
                  </td>
                  <td>{job.totalRows}</td>
                  <td>{job.importedRows}</td>
                  <td>{job.errorRows}</td>
                  <td>{job.createdAt.toLocaleString("sr-RS")}</td>
                  <td>
                    <code>{job.correlationId.slice(0, 8)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
