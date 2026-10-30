"use client";

import { createContext, useCallback, useContext } from "react";
import type { Locale } from "./locales";
import { translateRuDemo } from "./ru-demo";
import { translateEn } from "./en-copy";

const LocaleContext = createContext<Locale>("sr-Latn");

export function UiLocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useUiText() {
  const locale = useContext(LocaleContext);
  return useCallback(
    (source: string) =>
      locale === "ru"
        ? translateRuDemo(source)
        : locale === "en"
          ? translateEn(source)
          : source,
    [locale],
  );
}
