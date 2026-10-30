import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { serverUiText } from "@/i18n/server";
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const actor = await requireActor("audit:read");
  const t = await serverUiText();
  const { action } = await searchParams;
  const rows = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, actor.organizationId),
        action ? eq(auditEvents.action, action) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(200);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("SLEDLJIVOST")}</div>
          <h1>{t("Dnevnik aktivnosti")}</h1>
          <p>{t("Neizmenjivi zapis važnih radnji, zahteva i odluka.")}</p>
        </div>
      </div>
      <form className="filter-bar">
        <select
          name="action"
          defaultValue={action ?? ""}
          aria-label={t("Filter action")}
        >
          <option value="">{t("Sve radnje")}</option>
          {[
            "shipment.created",
            "shipment.updated",
            "shipment.validated",
            "document.prepared",
            "document.submitted",
            "document.accepted",
            "document.rejected",
            "document.failed",
            "retry.requested",
            "import.completed",
            "mapping.updated",
            "exception.resolved",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <button className="button subtle">{t("Filtriraj")}</button>
      </form>
      <section className="work-panel table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Vreme")}</th>
                <th>{t("Radnja")}</th>
                <th>{t("Entitet")}</th>
                <th>{t("Opis")}</th>
                <th>{t("Correlation ID")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={event.id}>
                  <td>{event.createdAt.toLocaleString("sr-RS")}</td>
                  <td>
                    <code>{event.action}</code>
                  </td>
                  <td>{event.entityType}</td>
                  <td>{t(event.summary)}</td>
                  <td>
                    <code>{event.correlationId.slice(0, 8)}</code>
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
