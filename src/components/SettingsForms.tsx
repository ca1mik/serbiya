"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUiText } from "@/i18n/ui-client";
export function SettingsForms({ canCreateOrg }: { canCreateOrg: boolean }) {
  const t = useUiText();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    endpoint: string,
  ) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(t(data.error?.message ?? "Čuvanje nije uspelo"));
      setMessage(
        t(
          endpoint === "/api/organizations"
            ? `Organizacija je kreirana. Prijavite se kao ${data.email} i nastavite podešavanje.`
            : "Sačuvano.",
        ),
      );
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : "Greška"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-forms">
      <section className="work-panel">
        <div className="panel-heading">
          <h2>{t("Dodaj lokaciju")}</h2>
        </div>
        <form
          className="settings-form"
          onSubmit={(e) => submit(e, "/api/settings/locations")}
        >
          <label>
            {t("Naziv")}{" "}
            <input name="name" required placeholder={t("Centralni magacin")} />
          </label>
          <label>
            {t("Adresa")}{" "}
            <input
              name="address"
              required
              placeholder={t("Ulica 1, Beograd")}
            />
          </label>
          <button className="button primary" disabled={busy}>
            {t("Dodaj lokaciju")}{" "}
          </button>
        </form>
      </section>
      <section className="work-panel">
        <div className="panel-heading">
          <h2>{t("Dodaj korisnika")}</h2>
        </div>
        <form
          className="settings-form"
          onSubmit={(e) => submit(e, "/api/settings/users")}
        >
          <label>
            {t("Ime")} <input name="name" required />
          </label>
          <label>
            {t("Email")} <input name="email" type="email" required />
          </label>
          <div className="settings-field">
            <label htmlFor="new-user-role">{t("Uloga")}</label>
            <select id="new-user-role" name="role">
              <option value="OPERATIONS">{t("OPERATIONS")}</option>
              <option value="WAREHOUSE">{t("WAREHOUSE")}</option>
              <option value="ACCOUNTING">{t("ACCOUNTING")}</option>
              <option value="VIEWER">{t("VIEWER")}</option>
              <option value="ADMIN">{t("ADMIN")}</option>
              <option value="OWNER">{t("OWNER")}</option>
            </select>
          </div>
          <label>
            {t("Privremena lozinka")}{" "}
            <input name="password" type="password" minLength={10} required />
          </label>
          <button className="button primary" disabled={busy}>
            {t("Dodaj korisnika")}{" "}
          </button>
        </form>
      </section>
      {canCreateOrg && (
        <section className="work-panel">
          <div className="panel-heading">
            <h2>{t("Novi pilot klijent")}</h2>
          </div>
          <div className="scope-note">
            {t(
              "Kreirajte organizaciju i njenog vlasnika. Potom se prijavite novim nalogom, dodajte lokacije, uvezite probnu datoteku i sačuvajte mapiranje.",
            )}{" "}
          </div>
          <form
            className="settings-form"
            onSubmit={(e) => submit(e, "/api/organizations")}
          >
            <label>
              {t("Naziv firme")} <input name="name" required />
            </label>
            <label>
              {t("URL oznaka")}{" "}
              <input
                name="slug"
                required
                pattern="[a-z0-9-]{3,60}"
                placeholder={t("pilot-firma")}
              />
            </label>
            <label>
              {t("Email vlasnika")} <input name="email" type="email" required />
            </label>
            <label>
              {t("Lozinka vlasnika")}{" "}
              <input name="password" type="password" minLength={10} required />
            </label>
            <button className="button primary" disabled={busy}>
              {t("Kreiraj organizaciju")}{" "}
            </button>
          </form>
        </section>
      )}
      {message && (
        <p role="status" className="inline-message">
          {message}
        </p>
      )}
    </div>
  );
}
