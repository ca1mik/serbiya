import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { locations, organizations, users } from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { SettingsForms } from "@/components/SettingsForms";
import { serverUiText } from "@/i18n/server";
export default async function SettingsPage() {
  const t = await serverUiText();
  const actor = await requireActor("settings:write");
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId))
    .limit(1);
  const [places, people] = await Promise.all([
    db
      .select()
      .from(locations)
      .where(eq(locations.organizationId, actor.organizationId)),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.organizationId, actor.organizationId)),
  ]);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("ORGANIZACIJA")}</div>
          <h1>{t("Podešavanja")}</h1>
          <p>{t("Firma, lokacije, korisnici i put do prvog uvoza.")}</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="work-panel">
          <div className="panel-heading">
            <h2>{t("Firma")}</h2>
          </div>
          <div className="settings-summary">
            <div>
              <span>{t("Naziv")}</span>
              <strong>{organization.name}</strong>
            </div>
            <div>
              <span>{t("PIB")}</span>
              <strong>{organization.taxId ?? t("Nije podešen")}</strong>
            </div>
            <div>
              <span>{t("Režim eOtpremnica")}</span>
              <strong>
                {(process.env.EOTPREMNICA_MODE ?? "mock").toUpperCase()}
              </strong>
            </div>
          </div>
        </section>
        <section className="work-panel">
          <div className="panel-heading">
            <h2>{t("Prvi uvoz")}</h2>
          </div>
          <ol className="onboarding-list">
            <li>{t("Dodajte lokaciju.")}</li>
            <li>
              <Link href="/imports">{t("Učitajte CSV ili XLSX.")}</Link>
            </li>
            <li>{t("Mapirajte kolone i sačuvajte šablon.")}</li>
            <li>{t("Proverite uvezene otpremnice.")}</li>
          </ol>
        </section>
        <section className="work-panel">
          <div className="panel-heading">
            <h2>{t("Lokacije")}</h2>
          </div>
          <div className="settings-list">
            {places.map((place) => (
              <div key={place.id}>
                <strong>{place.name}</strong>
                <span>{place.address}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="work-panel">
          <div className="panel-heading">
            <h2>{t("Korisnici i uloge")}</h2>
          </div>
          <div className="settings-list">
            {people.map((person) => (
              <div key={person.id}>
                <strong>{person.name}</strong>
                <span>
                  {t(person.role)} · {person.email}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <SettingsForms canCreateOrg={actor.role === "OWNER"} />
      <div className="settings-links">
        <Link href="/integrations">{t("Integracije →")}</Link>
        <Link href="/mappings">{t("Jedinice i mapiranja →")}</Link>
      </div>
    </>
  );
}
