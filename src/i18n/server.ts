import { cookies } from "next/headers";
import { dictionary, locales, type Locale } from "./locales";
import { translateRuDemo } from "./ru-demo";
import { translateEn } from "./en-copy";
export async function serverLocale(): Promise<Locale> {
  const requested =
    (await cookies()).get("otprema_locale")?.value ??
    process.env.DEMO_LOCALE ??
    "sr-Latn";
  return requested in locales ? (requested as Locale) : "sr-Latn";
}
export async function serverDictionary() {
  return dictionary(await serverLocale());
}
export async function serverUiText() {
  const locale = await serverLocale();
  return (source: string) =>
    locale === "ru"
      ? translateRuDemo(source)
      : locale === "en"
        ? translateEn(source)
        : source;
}
