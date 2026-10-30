import type { Metadata } from "next";
import { serverLocale } from "@/i18n/server";
import { UiLocaleProvider } from "@/i18n/ui-client";
import "./globals.css";
export const metadata: Metadata = {
  title: "OtpremaOps",
  description: "Operational shipment control for Serbian SMEs",
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await serverLocale();
  return (
    <html lang={locale}>
      <body>
        <UiLocaleProvider locale={locale}>{children}</UiLocaleProvider>
      </body>
    </html>
  );
}
