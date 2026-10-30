import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import {
  auditEvents,
  customers,
  dispatchDocuments,
  importJobs,
  integrationConnections,
  integrationRequests,
  locations,
  mappingTemplates,
  organizations,
  products,
  shipmentLines,
  shipments,
  unitMappings,
  users,
  validationIssues,
} from "../src/db/schema";
import { serializeDemoXml } from "../src/integrations/eotpremnica/xml";
import type { EotpremnicaDocumentDTO } from "../src/integrations/eotpremnica/types";

async function seedOrganization(
  name: string,
  slug: string,
  email: string,
  count: number,
) {
  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (existing[0]) {
    console.info(`${slug} already seeded`);
    return;
  }
  await db.transaction(async (tx) => {
    const db = tx;
    const [organization] = await db
      .insert(organizations)
      .values({ name, slug, taxId: "DEMO-INVALID-PIB" })
      .returning();
    const passwordHash = await hash("Demo1234!", 12);
    const roles =
      slug === "dunav-demo"
        ? ["OWNER", "ADMIN", "OPERATIONS", "WAREHOUSE", "ACCOUNTING", "VIEWER"]
        : ["OWNER"];
    const people =
      slug === "dunav-demo"
        ? [
            "Milena Petrović",
            "Nikola Ilić",
            "Jelena Marković",
            "Stefan Jovanović",
            "Ana Nikolić",
            "Maja Popović",
          ]
        : ["Drugi Owner"];
    const accounts = await db
      .insert(users)
      .values(
        roles.map((role, index) => ({
          organizationId: organization.id,
          email:
            index === 0 ? email : `${role.toLowerCase()}@dunav.demo.invalid`,
          name: people[index],
          role,
          passwordHash,
        })),
      )
      .returning();
    const [warehouse] = await db
      .insert(locations)
      .values(
        [
          "Beograd – centralni magacin",
          "Novi Sad – distributivni centar",
          "Niš – pretovar",
        ].map((place, i) => ({
          organizationId: organization.id,
          name: place,
          address: [
            "Industrijska 12, Beograd",
            "Radna 4, Novi Sad",
            "Magacinska 7, Niš",
          ][i],
        })),
      )
      .returning();
    await db
      .insert(products)
      .values(
        Array.from({ length: 50 }, (_, i) => ({
          organizationId: organization.id,
          sku: `ART-${String(i + 1).padStart(3, "0")}`,
          name:
            [
              "Vijak pocinkovani",
              "Pločasti materijal",
              "Industrijska boja",
              "Spojnica",
              "Pakovanje robe",
            ][i % 5] + ` ${i + 1}`,
          defaultUnit: ["KOM", "KG", "PAK"][i % 3],
        })),
      );
    const clientRows = await db
      .insert(customers)
      .values(
        Array.from({ length: 25 }, (_, i) => ({
          organizationId: organization.id,
          name:
            i === 7
              ? "Demo Timeout Kupac"
              : `Kupac Demo ${String(i + 1).padStart(2, "0")} d.o.o.`,
          taxId: `DEMO-PIB-${String(i + 1).padStart(3, "0")}`,
          address: [
            "Bulevar 21, Beograd",
            "Dunavska 8, Novi Sad",
            "Zanatska 3, Kragujevac",
            "Trg 5, Subotica",
          ][i % 4],
        })),
      )
      .returning();
    await db.insert(unitMappings).values(
      [
        { sourceUnit: "kom", normalizedUnit: "KOM" },
        { sourceUnit: "kg", normalizedUnit: "KG" },
        { sourceUnit: "pak", normalizedUnit: "PAK" },
      ].map((x) => ({ organizationId: organization.id, ...x })),
    );
    await db
      .insert(mappingTemplates)
      .values({
        organizationId: organization.id,
        name: "Standardni CSV izvoz",
        source: "CSV",
        mapping: {
          "Broj otpremnice": "number",
          "Eksterni ID": "externalId",
          Kupac: "recipientName",
          "Kupac PIB": "recipientTaxId",
          "Adresa isporuke": "destination",
          "Datum otpreme": "plannedAt",
          "Šifra artikla": "sku",
          Opis: "description",
          Količina: "quantity",
          JM: "unit",
        },
      });
    await db.insert(integrationConnections).values([
      {
        organizationId: organization.id,
        kind: "LEGACY_ERP",
        name: "Legacy ERP (demo)",
        mode: "DEMO",
        state: "CONNECTED",
        lastSuccessAt: new Date(),
        itemsProcessed: count,
      },
      {
        organizationId: organization.id,
        kind: "CSV",
        name: "CSV / Excel import",
        mode: "LOCAL",
        state: "CONNECTED",
        lastSuccessAt: new Date(),
        itemsProcessed: 24,
      },
      {
        organizationId: organization.id,
        kind: "EOTPREMNICA",
        name: "eOtpremnica",
        mode: "MOCK",
        state: "CONNECTED",
        lastSuccessAt: new Date(),
        itemsProcessed: 18,
      },
      {
        organizationId: organization.id,
        kind: "SEF",
        name: "SEF / eFaktura",
        mode: "MOCK",
        state: "LIMITED",
        itemsProcessed: 0,
      },
    ]);
    const imports = await db
      .insert(importJobs)
      .values(
        ["maj-izvoz.csv", "narudzbine.xlsx", "ispravke.csv"].map(
          (filename, i) => ({
            organizationId: organization.id,
            filename,
            source: filename.endsWith("xlsx") ? "XLSX" : "CSV",
            status: i === 1 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
            totalRows: 12 + i,
            importedRows: 12,
            errorRows: i === 1 ? 1 : 0,
            correlationId: randomUUID(),
            createdBy: accounts[0].id,
          }),
        ),
      )
      .returning();
    const statuses = [
      "NEEDS_DATA",
      "NEEDS_DATA",
      "NEEDS_DATA",
      "REJECTED",
      "FAILED_TRANSIENT",
      "SUBMITTED",
      "READY",
      "IMPORTED",
      "ACCEPTED",
      "DELIVERED",
      "CANCELLED",
      "DRAFT",
    ];
    for (let i = 0; i < count; i++) {
      const status = statuses[i % statuses.length];
      const customer = clientRows[i % clientRows.length];
      const number = `${slug === "dunav-demo" ? "OT" : "BO"}-2026-${String(i + 1).padStart(4, "0")}`;
      const correlationId = randomUUID();
      const plannedAt = new Date(Date.now() + ((i % 6) - 2) * 86400000);
      const needsUnit = status === "NEEDS_DATA" && i % 3 === 1;
      const missingTax = status === "NEEDS_DATA" && i % 3 === 0;
      const missingDestination = status === "NEEDS_DATA" && i % 3 === 2;
      const sku =
        status === "REJECTED"
          ? "SKU-DEMO-FAIL"
          : `ART-${String((i % 50) + 1).padStart(3, "0")}`;
      const [shipment] = await db
        .insert(shipments)
        .values({
          organizationId: organization.id,
          number,
          externalId: `ERP-${slug}-${i + 1}`,
          source: i % 5 === 0 ? "CSV" : "LEGACY_ERP",
          customerId: customer.id,
          recipientName:
            status === "FAILED_TRANSIENT"
              ? "Demo Timeout Kupac"
              : customer.name,
          recipientTaxId: missingTax ? null : customer.taxId,
          destination: missingDestination ? null : customer.address,
          senderName: name,
          shipFrom: warehouse.address,
          plannedAt,
          transport: `BG-${String(100 + i).padStart(3, "0")}-AA`,
          status,
          documentStatus: ["ACCEPTED", "REJECTED", "DELIVERED"].includes(status)
            ? status
            : status === "SUBMITTED"
              ? "PROCESSING"
              : status === "FAILED_TRANSIENT"
                ? "FAILED_TRANSIENT"
                : "NONE",
          validationVersion: [
            "READY",
            "REJECTED",
            "FAILED_TRANSIENT",
            "SUBMITTED",
            "ACCEPTED",
            "DELIVERED",
          ].includes(status)
            ? 1
            : 0,
          sourceData: { system: "Legacy ERP demo", order: `N-${1000 + i}` },
          importJobId: i % 5 === 0 ? imports[i % 3].id : null,
          correlationId,
        })
        .returning();
      await db
        .insert(shipmentLines)
        .values({
          organizationId: organization.id,
          shipmentId: shipment.id,
          sku,
          description:
            sku === "SKU-DEMO-FAIL"
              ? "Demo odbijena stavka"
              : `Demo artikal ${(i % 50) + 1}`,
          quantity: String((i % 12) + 1),
          sourceUnit: needsUnit ? "kutija" : "kom",
          normalizedUnit: needsUnit ? null : "KOM",
          sourceReference: `LINE-${i + 1}`,
        });
      if (status === "NEEDS_DATA")
        await db
          .insert(validationIssues)
          .values({
            organizationId: organization.id,
            shipmentId: shipment.id,
            category: needsUnit ? "INTEGRATION_REQUIRED" : "INTERNAL_REQUIRED",
            code: needsUnit
              ? "UNIT_MAPPING_MISSING"
              : missingTax
                ? "RECIPIENT_TAX_ID_REQUIRED"
                : "DESTINATION_REQUIRED",
            severity: "ERROR",
            explanation: needsUnit
              ? "Unit 'kutija' has no mapping."
              : missingTax
                ? "Recipient tax ID is missing."
                : "Delivery address is missing.",
            recommendedAction: needsUnit
              ? "Create a unit mapping for kutija."
              : "Open shipment and complete the missing field.",
          });
      if (
        [
          "REJECTED",
          "FAILED_TRANSIENT",
          "SUBMITTED",
          "ACCEPTED",
          "DELIVERED",
        ].includes(status)
      ) {
        const dto: EotpremnicaDocumentDTO = {
          schema: "otpremaops-demo-v1",
          shipmentNumber: number,
          sender: name,
          recipient: { name: customer.name, taxId: customer.taxId ?? "" },
          destination: customer.address ?? "",
          plannedAt: plannedAt.toISOString(),
          lines: [
            {
              sku,
              description: "Demo artikal",
              quantity: String((i % 12) + 1),
              unit: "KOM",
            },
          ],
        };
        const [doc] = await db
          .insert(dispatchDocuments)
          .values({
            organizationId: organization.id,
            shipmentId: shipment.id,
            version: 1,
            status:
              status === "SUBMITTED"
                ? "PROCESSING"
                : status === "FAILED_TRANSIENT"
                  ? "PREPARED"
                  : status === "DELIVERED"
                    ? "ACCEPTED"
                    : status,
            payload: dto,
            xml: serializeDemoXml(dto),
            externalDocumentId: ["ACCEPTED", "DELIVERED"].includes(status)
              ? `mock-doc-seed-${i}`
              : null,
          })
          .returning();
        const [request] = await db
          .insert(integrationRequests)
          .values({
            organizationId: organization.id,
            shipmentId: shipment.id,
            documentId: doc.id,
            operation: "submitDispatch",
            idempotencyKey: `seed-${slug}-${i}`,
            requestId:
              status === "FAILED_TRANSIENT" ? null : `mock-req-seed-${i}`,
            state:
              status === "DELIVERED"
                ? "ACCEPTED"
                : status === "SUBMITTED"
                  ? "PROCESSING"
                  : status,
            requestPayload: dto,
            responsePayload:
              status === "FAILED_TRANSIENT"
                ? null
                : { demo: true, state: status },
            attemptCount: status === "FAILED_TRANSIENT" ? 3 : 1,
            errorCode:
              status === "FAILED_TRANSIENT"
                ? "TIMEOUT"
                : status === "REJECTED"
                  ? "DEMO_SKU_REJECTED"
                  : null,
            errorMessage:
              status === "FAILED_TRANSIENT"
                ? "Demo timeout after 3 attempts"
                : status === "REJECTED"
                  ? "Demo SKU rejected"
                  : null,
            correlationId,
          })
          .returning();
        if (["REJECTED", "FAILED_TRANSIENT"].includes(status))
          await db
            .insert(validationIssues)
            .values({
              organizationId: organization.id,
              shipmentId: shipment.id,
              requestId: request.id,
              category:
                status === "REJECTED"
                  ? "GOVERNMENT_REJECTION"
                  : "INTEGRATION_REQUIRED",
              code:
                status === "REJECTED" ? "DEMO_SKU_REJECTED" : "RETRY_EXHAUSTED",
              severity: "ERROR",
              explanation:
                status === "REJECTED"
                  ? "Demo rejection: reserved SKU."
                  : "Demo API timeout; retry exhausted.",
              recommendedAction:
                status === "REJECTED"
                  ? "Correct SKU, revalidate, prepare and send again."
                  : "Retry the request after checking connectivity.",
              attemptCount: status === "FAILED_TRANSIENT" ? 3 : 1,
            });
      }
      await db
        .insert(auditEvents)
        .values({
          organizationId: organization.id,
          actorId: accounts[0].id,
          action: "shipment.created",
          entityType: "shipment",
          entityId: shipment.id,
          summary: "Demo shipment seeded",
          metadata: { demo: true },
          correlationId,
        });
    }
    console.info(`Seeded ${name}: ${count} shipments`);
  });
}
await seedOrganization(
  "Dunav Distribucija d.o.o. (DEMO)",
  "dunav-demo",
  "owner@dunav.demo.invalid",
  120,
);
await seedOrganization(
  "Drugi Pilot d.o.o. (DEMO)",
  "drugi-demo",
  "owner@drugi.demo.invalid",
  5,
);
await pool.end();
