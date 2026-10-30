import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 900 },
  });
  await page.goto(pathToFileURL(resolve("docs/OFFER_SR.html")).href);
  await page.emulateMedia({ media: "print" });
  const overlaps = await page.locator(".page").evaluateAll((pages) =>
    pages.some((page) => {
      const footer = page.querySelector(".footer");
      const source = page.querySelector(".source");
      return (
        footer &&
        source &&
        source.getBoundingClientRect().bottom >
          footer.getBoundingClientRect().top
      );
    }),
  );
  if (overlaps) throw new Error("Offer content overlaps a page footer");
  await page.pdf({
    path: "docs/OFFER_SR.pdf",
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await page.screenshot({ path: ".visual-offer.png", fullPage: true });
  console.info(
    "Created docs/OFFER_SR.pdf (draft; fill seller and client details before sending).",
  );
} finally {
  await browser.close();
}
