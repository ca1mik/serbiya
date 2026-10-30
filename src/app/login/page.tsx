import { currentActor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { serverUiText } from "@/i18n/server";
export default async function Login() {
  if (await currentActor()) redirect("/operations");
  const t = await serverUiText();
  return (
    <main className="login-wrap">
      <section className="login-panel">
        <div className="brand">
          <span className="brand-mark">{t("O")}</span>
          <span>{t("OtpremaOps")}</span>
        </div>
        <div className="login-eyebrow">{t("OPERATIVNA KONTROLA")}</div>
        <h1>{t("Prijava")}</h1>
        <p>{t("Otpremnice, dokumenti i greške na jednom mestu.")}</p>
        <LoginForm />
        <div className="login-foot">
          {t("Demo nalog: owner@dunav.demo.invalid · Demo1234!")}{" "}
        </div>
      </section>
      <aside className="login-side">
        <div>
          <div className="eyebrow">{t("DUNAV DISTRIBUCIJA · DEMO")}</div>
          <h2>{t("Šta zahteva pažnju danas?")}</h2>
          <p>
            {t(
              "Jedan red rada za uvoz, proveru, slanje i rešavanje neuspelih otpremnica.",
            )}{" "}
          </p>
        </div>
        <div className="login-side-grid">
          <span>{t("01 / Uvoz")}</span>
          <span>{t("02 / Provera")}</span>
          <span>{t("03 / Slanje")}</span>
          <span>{t("04 / Praćenje")}</span>
        </div>
      </aside>
    </main>
  );
}
