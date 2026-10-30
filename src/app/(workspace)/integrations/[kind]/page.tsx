import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import {
  integrationConnections,
  integrationEvents,
  integrationRequests,
} from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { serverUiText } from "@/i18n/server";
export default async function IntegrationDetail({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const actor = await requireActor();
  const t = await serverUiText();
  const { kind } = await params;
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, actor.organizationId),
        eq(integrationConnections.kind, kind.toUpperCase()),
      ),
    )
    .limit(1);
  if (!connection) notFound();
  const events =
    kind === "eotpremnica"
      ? await db
          .select()
          .from(integrationEvents)
          .where(eq(integrationEvents.organizationId, actor.organizationId))
          .orderBy(desc(integrationEvents.createdAt))
          .limit(30)
      : [];
  const requests =
    kind === "eotpremnica"
      ? await db
          .select()
          .from(integrationRequests)
          .where(eq(integrationRequests.organizationId, actor.organizationId))
          .orderBy(desc(integrationRequests.createdAt))
          .limit(30)
      : [];
  return (
    <>
      <div className="detail-back">
        <Link href="/integrations">{t("← Integracije")}</Link>
        <span>/ {connection.name}</span>
      </div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("KONFIGURACIJA VEZE")}</div>
          <h1>
            {connection.name} <StatusBadge status={connection.state} />
          </h1>
          <p>
            {t("Režim:")}{" "}
            {kind === "eotpremnica"
              ? (process.env.EOTPREMNICA_MODE ?? "mock").toUpperCase()
              : connection.mode}
          </p>
        </div>
      </div>
      <div className="integration-sections">
        <section className="work-panel">
          <h2>{t("Konfiguracija i zdravlje")}</h2>
          <div className="info-grid">
            <div>
              <span>{t("Režim")}</span>
              <strong>{connection.mode}</strong>
            </div>
            <div>
              <span>{t("Stanje")}</span>
              <strong>{connection.state}</strong>
            </div>
            <div>
              <span>{t("Poslednji pokušaj")}</span>
              <strong>
                {connection.lastAttemptAt?.toLocaleString("sr-RS") ?? "—"}
              </strong>
            </div>
            <div>
              <span>{t("Poslednji uspeh")}</span>
              <strong>
                {connection.lastSuccessAt?.toLocaleString("sr-RS") ?? "—"}
              </strong>
            </div>
          </div>
          {kind === "eotpremnica" && (
            <div className="scope-note">
              {t(
                "MOCK, SANDBOX i PRODUCTION su odvojeni režimi. Trenutni režim se bira server-side kroz EOTPREMNICA_MODE. Sandbox i produkcija zahtevaju zvaničnu specifikaciju i kredencijale; neće preći na mock automatski.",
              )}{" "}
            </div>
          )}
          {kind === "legacy_erp" && (
            <p className="muted">
              {t(
                "Legacy ERP je demonstracioni adapter sa seed podacima. Direktne SQL konekcije nisu aktivirane.",
              )}{" "}
            </p>
          )}
          {kind === "sef" && (
            <p className="muted">
              {t(
                "SEF je samo interfejs za buduću vezu sa fakturom; nema slanja eFaktura.",
              )}{" "}
            </p>
          )}
          <Link href="/mappings" className="text-link">
            {t("Otvori mapiranja →")}{" "}
          </Link>
        </section>
        <section className="work-panel">
          <h2>{t("Istorija sinhronizacije i log")}</h2>
          {requests.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("Datum")}</th>
                    <th>{t("Operacija")}</th>
                    <th>{t("Status")}</th>
                    <th>{t("Pokušaji")}</th>
                    <th>{t("Greška")}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.createdAt.toLocaleString("sr-RS")}</td>
                      <td>{request.operation}</td>
                      <td>
                        <StatusBadge status={request.state} />
                      </td>
                      <td>{request.attemptCount}</td>
                      <td>{request.errorMessage ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{t("Nema zahteva za prikaz.")}</p>
          )}
          <h3>{t("Događaji")}</h3>
          <div className="timeline">
            {events.map((event) => (
              <div key={event.id}>
                <span>{event.createdAt.toLocaleString("sr-RS")}</span>
                <strong>{event.event}</strong>
                <p>{JSON.stringify(event.detail)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
