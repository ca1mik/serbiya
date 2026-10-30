import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

async function login(
  page: import("@playwright/test").Page,
  email = "owner@dunav.demo.invalid",
) {
  await page.context().addCookies([
    {
      name: "otprema_locale",
      value: "sr-Latn",
      url: process.env.APP_URL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Lozinka").fill("Demo1234!");
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page).toHaveURL(/\/operations/);
}
test("Russian demo language makes the main workflow readable", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "otprema_locale",
      value: "ru",
      url: process.env.APP_URL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
  await page.getByLabel("Email").fill("owner@dunav.demo.invalid");
  await page.getByLabel("Пароль").fill("Demo1234!");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/operations/);
  await expect(page.getByRole("heading", { name: "Операции" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Очередь операций" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Отгрузки", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Отгрузки" })).toBeVisible();
});
test("language switch updates complete operational copy", async ({ page }) => {
  await login(page);
  await page.getByRole("combobox", { name: "Language" }).selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Operations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Operations queue" }),
  ).toBeVisible();
  await page.goto("/imports");
  await expect(
    page.getByRole("heading", { name: "Imports", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Choose file")).toBeVisible();
  await page.getByRole("combobox", { name: "Language" }).selectOption("ru");
  await expect(
    page.getByRole("heading", { name: "Импорт", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Выбрать файл")).toBeVisible();
  await page.goto("/settings");
  const user = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Добавить пользователя" }),
  });
  const email = `ru-${Date.now().toString(36)}@pilot.demo.invalid`;
  await user.getByLabel("Имя").fill("Тестовый оператор");
  await user.getByLabel("Email").fill(email);
  await user.getByLabel("Роль", { exact: true }).selectOption("OPERATIONS");
  await user.getByLabel("Временный пароль").fill("Pilot12345!");
  await user.getByRole("button", { name: "Добавить пользователя" }).click();
  await expect(page.getByText("Тестовый оператор")).toBeVisible();
});
test("login opens a populated operations queue", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Operativni red")).toBeVisible();
  await expect(page.locator(".data-table tbody tr").first()).toBeVisible();
});
test("warehouse can confirm preparation without editing business data", async ({
  page,
}) => {
  await login(page, "warehouse@dunav.demo.invalid");
  const response = await page.request.get("/api/shipments");
  const rows = (await response.json()) as {
    id: string;
    status: string;
    preparationState: string;
  }[];
  const target = rows.find(
    (row) => row.status === "IMPORTED" && row.preparationState === "PENDING",
  );
  expect(target).toBeDefined();
  await page.goto(`/shipments/${target!.id}`);
  await expect(
    page.getByRole("button", { name: "Potvrdi pripremu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Izmeni podatke" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Potvrdi pripremu" }).click();
  await expect(page.getByText("Priprema je potvrđena.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Potvrdi pripremu" }),
  ).toHaveCount(0);
});
test("owner can onboard a separate pilot with a location, user, and first import", async ({
  page,
  browser,
}) => {
  const runId = Date.now().toString(36);
  const email = `owner-${runId}@pilot.demo.invalid`;
  const password = "Pilot12345!";
  await login(page);
  await page.goto("/settings");
  const pilot = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Novi pilot klijent" }),
  });
  await pilot.getByLabel("Naziv firme").fill(`Pilot ${runId} d.o.o.`);
  await pilot.getByLabel("URL oznaka").fill(`pilot-${runId}`);
  await pilot.getByLabel("Email vlasnika").fill(email);
  await pilot.getByLabel("Lozinka vlasnika").fill(password);
  await pilot.getByRole("button", { name: "Kreiraj organizaciju" }).click();
  await expect(page.getByText(/Organizacija je kreirana/)).toBeVisible();

  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "otprema_locale",
      value: "sr-Latn",
      url: process.env.APP_URL ?? "http://localhost:3000",
    },
  ]);
  const pilotPage = await context.newPage();
  await pilotPage.goto("/login");
  await pilotPage.getByLabel("Email").fill(email);
  await pilotPage.getByLabel("Lozinka").fill(password);
  await pilotPage.getByRole("button", { name: "Prijavi se" }).click();
  await expect(pilotPage).toHaveURL(/\/operations/);
  await pilotPage.goto("/settings");
  await expect(
    pilotPage.getByText(`Pilot ${runId} d.o.o.`).first(),
  ).toBeVisible();

  const location = pilotPage.locator("section").filter({
    has: pilotPage.getByRole("heading", { name: "Dodaj lokaciju" }),
  });
  await location.getByLabel("Naziv").fill("Pilot magacin");
  await location.getByLabel("Adresa").fill("Probna 1, Beograd");
  await location.getByRole("button", { name: "Dodaj lokaciju" }).click();
  await expect(pilotPage.getByText("Pilot magacin")).toBeVisible();

  const user = pilotPage.locator("section").filter({
    has: pilotPage.getByRole("heading", { name: "Dodaj korisnika" }),
  });
  await user.getByLabel("Ime").fill("Pilot operater");
  await user.getByLabel("Email").fill(`operations-${runId}@pilot.demo.invalid`);
  await user.getByLabel("Uloga").selectOption("OPERATIONS");
  await user.getByLabel("Privremena lozinka").fill(password);
  await user.getByRole("button", { name: "Dodaj korisnika" }).click();
  await expect(pilotPage.getByText("Pilot operater")).toBeVisible();

  await pilotPage.goto("/imports");
  await pilotPage
    .locator('input[type="file"]')
    .setInputFiles(path.resolve("examples/imports/valid_shipments.csv"));
  await pilotPage.getByRole("button", { name: "Uvezi 3 redova" }).click();
  await expect(pilotPage.getByText("Uvoz završen")).toBeVisible();
  await context.close();
});
test("multi-line CSV creates two shipments with all three product lines", async ({
  page,
}) => {
  const runId = Date.now().toString(36);
  await login(page);
  await page.goto("/imports");
  const csv = fs
    .readFileSync(
      path.resolve("examples/imports/multiline_shipments.csv"),
      "utf8",
    )
    .replaceAll("MULTI-", `MULTI-${runId}-`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "multiline_shipments.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/imports") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Uvezi 3 redova" }).click(),
  ]);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    imported: 3,
    importedShipments: 2,
    errors: 0,
  });
  await expect(page.locator(".result-panel")).toContainText(
    "2 otpremnica je kreirano.",
  );
  const listResponse = await page.request.get("/api/shipments");
  const shipments = (await listResponse.json()) as {
    id: string;
    number: string;
  }[];
  const shipment = shipments.find((row) => row.number === `MULTI-${runId}-001`);
  expect(shipment).toBeDefined();
  const detail = await (
    await page.request.get(`/api/shipments/${shipment!.id}`)
  ).json();
  expect(detail.lines.map((line: { sku: string }) => line.sku).sort()).toEqual([
    "ART-001",
    "ART-002",
  ]);
});

test("CSV import, mock acceptance, rejection correction, and tenant isolation", async ({
  page,
  browser,
}) => {
  const runId = Date.now().toString(36);
  await login(page);
  await page.goto("/imports");
  const validCsv = fs
    .readFileSync(path.resolve("examples/imports/valid_shipments.csv"), "utf8")
    .replaceAll("PILOT-", `PILOT-${runId}-`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "valid_shipments.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(validCsv),
  });
  await expect(
    page.getByRole("button", { name: "Uvezi 3 redova" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Uvezi 3 redova" }).click();
  await expect(page.getByText("Uvoz završen")).toBeVisible();
  await page.getByRole("link", { name: "Otvori otpremnice" }).click();
  await page.getByLabel("Search shipments").fill(`PILOT-${runId}-001`);
  await page.getByRole("link", { name: `PILOT-${runId}-001` }).click();
  await expect(page).toHaveURL(/\/shipments\/[0-9a-f-]{36}$/);
  const shipmentUrl = page.url();
  await page.getByRole("button", { name: "Proveri", exact: true }).click();
  await expect(page.getByText("Provera je uspešna.")).toBeVisible();
  await page.getByRole("button", { name: "Pripremi dokument" }).click();
  await page.getByRole("button", { name: "Pošalji", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await page.request.get(
            `${new URL(shipmentUrl).pathname}/trace`.replace(
              "/shipments/",
              "/api/shipments/",
            ),
          )
        )
          .json()
          .then((data) => data.shipment.status),
      { timeout: 30000 },
    )
    .toBe("ACCEPTED");
  await page.reload();
  await expect(page.getByText("Prihvaćeno").first()).toBeVisible();
  await page.getByRole("tab", { name: "Dnevnik" }).click();
  await expect(page.getByText("document.accepted")).toBeVisible();

  await page.goto("/shipments");
  await page.getByLabel("Search shipments").fill(`PILOT-${runId}-002`);
  await page.getByRole("link", { name: `PILOT-${runId}-002` }).click();
  await expect(page).toHaveURL(/\/shipments\/[0-9a-f-]{36}$/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Otkaži" }).click();
  await expect(page.getByText("Otpremnica je otkazana.")).toBeVisible();
  await expect(page.getByText("Otkazano").first()).toBeVisible();

  await page.goto("/imports");
  const errorCsv = fs
    .readFileSync(
      path.resolve("examples/imports/shipments_with_errors.csv"),
      "utf8",
    )
    .replaceAll("ERR-", `ERR-${runId}-`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "shipments_with_errors.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(errorCsv),
  });
  await page.getByRole("button", { name: "Uvezi 3 redova" }).click();
  await page.goto("/shipments");
  await page.getByLabel("Search shipments").fill(`ERR-${runId}-003`);
  await page.getByRole("link", { name: `ERR-${runId}-003` }).click();
  await expect(page).toHaveURL(/\/shipments\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Proveri", exact: true }).click();
  await page.getByRole("button", { name: "Pripremi dokument" }).click();
  await page.getByRole("button", { name: "Pošalji", exact: true }).click();
  const rejectedUrl = page.url();
  await expect
    .poll(
      async () =>
        (
          await page.request.get(
            `${new URL(rejectedUrl).pathname}/trace`.replace(
              "/shipments/",
              "/api/shipments/",
            ),
          )
        )
          .json()
          .then((data) => data.shipment.status),
      { timeout: 30000 },
    )
    .toBe("REJECTED");
  await page.goto("/exceptions");
  await expect(
    page
      .getByText(
        "Demo rejection: SKU-DEMO-FAIL is reserved for failure testing.",
      )
      .first(),
  ).toBeVisible();
  await page.goto(rejectedUrl);
  await page.getByRole("button", { name: "Izmeni podatke" }).click();
  await page.getByLabel("Šifra artikla").fill("ART-004");
  await page.getByRole("button", { name: "Sačuvaj izmene" }).click();
  await page.getByRole("button", { name: "Proveri", exact: true }).click();
  await page.getByRole("button", { name: "Pripremi dokument" }).click();
  await page.getByRole("button", { name: "Pošalji", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await page.request.get(
            `${new URL(rejectedUrl).pathname}/trace`.replace(
              "/shipments/",
              "/api/shipments/",
            ),
          )
        )
          .json()
          .then((data) => data.shipment.status),
      { timeout: 30000 },
    )
    .toBe("ACCEPTED");

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, "owner@drugi.demo.invalid");
  await otherPage.goto(shipmentUrl);
  await expect(otherPage.getByText("404")).toBeVisible();
  await other.close();
});
