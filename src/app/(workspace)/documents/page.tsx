import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dispatchDocuments, shipments } from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { serverUiText } from "@/i18n/server";
export default async function DocumentsPage() {
  const t = await serverUiText();
  const actor = await requireActor();
  const integrationMode = (
    process.env.EOTPREMNICA_MODE ?? "mock"
  ).toLowerCase();
  const rows = await db
    .select({ document: dispatchDocuments, shipment: shipments })
    .from(dispatchDocuments)
    .innerJoin(
      shipments,
      and(
        eq(dispatchDocuments.shipmentId, shipments.id),
        eq(shipments.organizationId, actor.organizationId),
      ),
    )
    .where(eq(dispatchDocuments.organizationId, actor.organizationId))
    .orderBy(desc(dispatchDocuments.createdAt))
    .limit(200);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("TOK DOKUMENATA")}</div>
          <h1>{t("Dokumenti")}</h1>
          <p>{t("Status otpremnih dokumenata i veza sa otpremnicom.")}</p>
        </div>
      </div>
      <div className="scope-note">
        {t(
          integrationMode === "mock"
            ? "DEMO / MOCK — ID-jevi dokumenata u ovom okruženju nisu potvrde državnog sistema. Fakture (SEF) su samo buduća veza."
            : `Režim: ${integrationMode.toUpperCase()}. ID-jevi sa prefiksom mock- potiču iz demo režima. Fakture (SEF) su samo buduća veza.`,
        )}
      </div>
      <section className="work-panel table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("Tip")}</th>
                <th>{t("Otpremnica")}</th>
                <th>{t("Status")}</th>
                <th>{t("Verzija")}</th>
                <th>{t("ID dokumenta")}</th>
                <th>{t("Kreirano")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ document, shipment }) => (
                <tr key={document.id}>
                  <td>{t("Otpremni dokument")}</td>
                  <td>
                    <Link
                      className="row-link"
                      href={`/shipments/${shipment.id}`}
                    >
                      {shipment.number}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={document.status} />
                  </td>
                  <td>{document.version}</td>
                  <td>
                    <code>{document.externalDocumentId ?? "—"}</code>
                  </td>
                  <td>{document.createdAt.toLocaleString("sr-RS")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
