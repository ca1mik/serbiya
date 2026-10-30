import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrationConnections } from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { serverUiText } from "@/i18n/server";
const descriptions: Record<string, string> = {
  LEGACY_ERP: "Primer sinhronizacije iz postojećeg ERP sistema.",
  CSV: "Uvoz izvoza iz Excela i drugih sistema.",
  EOTPREMNICA: "Validacija, slanje i praćenje otpremnih dokumenata.",
  SEF: "Granica za kasnije povezivanje sa eFakturom.",
};
export default async function IntegrationsPage() {
  const t = await serverUiText();
  const actor = await requireActor();
  const eotMode = (process.env.EOTPREMNICA_MODE ?? "mock").toUpperCase();
  const rows = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.organizationId, actor.organizationId));
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("POSTOJEĆI SISTEMI")}</div>
          <h1>{t("Integracije")}</h1>
          <p>{t("Stanje veza, poslednja aktivnost i režim rada.")}</p>
        </div>
      </div>
      <div className="integration-grid">
        {rows.map((row) => (
          <Link
            href={`/integrations/${row.kind.toLowerCase()}`}
            className="integration-card"
            key={row.id}
          >
            <div className="integration-card-head">
              <span className="integration-symbol">
                {row.kind === "EOTPREMNICA"
                  ? "eO"
                  : row.kind === "LEGACY_ERP"
                    ? "ERP"
                    : row.kind === "SEF"
                      ? "SEF"
                      : "CSV"}
              </span>
              <StatusBadge status={row.state} />
            </div>
            <h2>{row.name}</h2>
            <p>{t(descriptions[row.kind])}</p>
            {row.kind === "EOTPREMNICA" && (
              <div
                className="mode-strip"
                role="group"
                aria-label={t("eOtpremnica mode")}
              >
                {["MOCK", "SANDBOX", "PRODUCTION"].map((mode) => (
                  <span
                    key={mode}
                    className={mode === eotMode ? "active" : ""}
                    aria-current={mode === eotMode ? "true" : undefined}
                  >
                    {mode}
                  </span>
                ))}
              </div>
            )}
            <div className="integration-facts">
              <div>
                <span>{t("Režim")}</span>
                <strong>
                  {row.kind === "EOTPREMNICA" ? eotMode : row.mode}
                </strong>
              </div>
              <div>
                <span>{t("Poslednji uspeh")}</span>
                <strong>
                  {row.lastSuccessAt?.toLocaleString("sr-RS") ?? "—"}
                </strong>
              </div>
              <div>
                <span>{t("Obrađeno")}</span>
                <strong>{row.itemsProcessed}</strong>
              </div>
              <div>
                <span>{t("Greške")}</span>
                <strong>{row.error ?? "—"}</strong>
              </div>
            </div>
            <span className="text-link">{t("Otvori detalje →")}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
