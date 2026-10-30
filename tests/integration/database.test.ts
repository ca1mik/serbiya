import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Actor } from "@/lib/auth";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
describe.skipIf(!enabled)("database workflow", () => {
  afterAll(async () => {
    const { pool } = await import("@/db/client");
    await pool.end();
  });
  it("handles background database errors without logging connection details", async () => {
    const { pool } = await import("@/db/client");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const error = Object.assign(
        new Error("connection detail must stay private"),
        {
          code: "57P01",
          client: { password: "must-not-log", connectionString: "private-url" },
        },
      );
      expect(() => pool.emit("error", error)).not.toThrow();
      expect(log).toHaveBeenCalledWith(
        JSON.stringify({
          level: "error",
          operation: "database.idle_connection",
          result: "connection_lost",
          code: "57P01",
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain("must-not-log");
      expect(JSON.stringify(log.mock.calls)).not.toContain("private-url");
    } finally {
      log.mockRestore();
    }
  });
  it("enforces tenant scope and one queued submission for duplicate Send", async () => {
    const { db } = await import("@/db/client");
    const {
      organizations,
      shipments,
      shipmentLines,
      users,
      unitMappings,
      integrationRequests,
    } = await import("@/db/schema");
    const { getShipment, validateAndSave, prepareDocument, sendDocument } =
      await import("@/services/shipment");
    const suffix = randomUUID().slice(0, 8);
    const [a, b] = await db
      .insert(organizations)
      .values([
        { name: `Test A ${suffix}`, slug: `test-a-${suffix}` },
        { name: `Test B ${suffix}`, slug: `test-b-${suffix}` },
      ])
      .returning();
    const actorA: Actor = {
      id: randomUUID(),
      organizationId: a.id,
      name: "Test",
      email: "test@example.invalid",
      role: "OWNER",
    };
    const actorB: Actor = { ...actorA, organizationId: b.id };
    await db.insert(users).values({
      id: actorA.id,
      organizationId: a.id,
      email: `test-${suffix}@example.invalid`,
      name: "Test",
      role: "OWNER",
      passwordHash: "not-for-login",
    });
    const [shipment] = await db
      .insert(shipments)
      .values({
        organizationId: a.id,
        number: `TEST-${suffix}`,
        externalId: `TEST-${suffix}`,
        source: "CSV",
        recipientName: "Test kupac",
        recipientTaxId: "DEMO",
        destination: "Radna 1",
        senderName: "Test sender",
        plannedAt: new Date("2026-10-01"),
        status: "IMPORTED",
        correlationId: randomUUID(),
      })
      .returning();
    await db.insert(shipmentLines).values({
      organizationId: a.id,
      shipmentId: shipment.id,
      sku: "ART-1",
      description: "Test",
      quantity: "1",
      sourceUnit: "kom",
    });
    await expect(getShipment(actorB, shipment.id)).rejects.toThrow("not found");
    await db.insert(unitMappings).values({
      organizationId: a.id,
      sourceUnit: "kom",
      normalizedUnit: "KOM",
    });
    expect((await validateAndSave(actorA, shipment.id)).valid).toBe(true);
    await prepareDocument(actorA, shipment.id);
    const first = await sendDocument(actorA, shipment.id);
    const second = await sendDocument(actorA, shipment.id);
    expect(first.id).toBe(second.id);
    const requests = await db
      .select()
      .from(integrationRequests)
      .where(eq(integrationRequests.shipmentId, shipment.id));
    expect(requests).toHaveLength(1);
  });
  it("imports CSV rows, validates, submits, and resolves through the worker", async () => {
    const fs = await import("node:fs/promises");
    const { db } = await import("@/db/client");
    const { organizations, shipments, integrationRequests, auditEvents } =
      await import("@/db/schema");
    const { parseImportFile } = await import("@/integrations/import/parser");
    const { importShipments } = await import("@/services/imports");
    const { validateAndSave, prepareDocument, sendDocument, getShipment } =
      await import("@/services/shipment");
    const { runOneJob } = await import("@/jobs/queue");
    const suffix = randomUUID().slice(0, 8);
    const [organization] = await db
      .insert(organizations)
      .values({ name: `Import test ${suffix}`, slug: `import-test-${suffix}` })
      .returning();
    const [user] = await db
      .insert((await import("@/db/schema")).users)
      .values({
        organizationId: organization.id,
        email: `import-${suffix}@example.invalid`,
        name: "Import tester",
        role: "OWNER",
        passwordHash: "not-for-login",
      })
      .returning();
    const actor: Actor = {
      id: user.id,
      organizationId: organization.id,
      name: user.name,
      email: user.email,
      role: "OWNER",
    };
    await db.insert((await import("@/db/schema")).unitMappings).values({
      organizationId: organization.id,
      sourceUnit: "kom",
      normalizedUnit: "KOM",
    });
    const bytes = new Uint8Array(
      await fs.readFile("examples/imports/valid_shipments.csv"),
    );
    const rows = await parseImportFile("valid_shipments.csv", bytes);
    const mapping = {
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
    } as const;
    const imported = await importShipments(
      actor,
      "valid_shipments.csv",
      rows,
      mapping,
    );
    expect(imported.imported).toBe(3);
    const [shipment] = await db
      .select()
      .from(shipments)
      .where(
        and(
          eq(shipments.organizationId, organization.id),
          eq(shipments.number, "PILOT-001"),
        ),
      )
      .limit(1);
    expect(shipment.source).toBe("CSV");
    expect(shipment.senderName).toBe(organization.name);
    expect((await validateAndSave(actor, shipment.id)).valid).toBe(true);
    await prepareDocument(actor, shipment.id);
    await sendDocument(actor, shipment.id);
    process.env.MOCK_DELAY_MS = "0";
    for (let i = 0; i < 12; i++) {
      await runOneJob();
      if (
        (await getShipment(actor, shipment.id)).shipment.status === "ACCEPTED"
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect((await getShipment(actor, shipment.id)).shipment.status).toBe(
      "ACCEPTED",
    );
    expect(
      (
        await db
          .select()
          .from(integrationRequests)
          .where(eq(integrationRequests.shipmentId, shipment.id))
      )[0].requestId,
    ).toMatch(/^mock-req-/);
    expect(
      (
        await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.correlationId, shipment.correlationId))
      ).map((x) => x.action),
    ).toContain("document.accepted");
  });
  it("imports multiple rows as one shipment with multiple product lines", async () => {
    const { db } = await import("@/db/client");
    const { organizations, users, shipments, shipmentLines, importRows } =
      await import("@/db/schema");
    const { importShipments } = await import("@/services/imports");
    const suffix = randomUUID().slice(0, 8);
    const [organization] = await db
      .insert(organizations)
      .values({ name: `Multiline ${suffix}`, slug: `multiline-${suffix}` })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        organizationId: organization.id,
        email: `multiline-${suffix}@example.invalid`,
        name: "Import tester",
        role: "OWNER",
        passwordHash: "not-for-login",
      })
      .returning();
    const actor: Actor = {
      id: user.id,
      organizationId: organization.id,
      name: user.name,
      email: user.email,
      role: "OWNER",
    };
    const number = `MULTI-${suffix}`;
    const rows = [
      {
        Number: number,
        Recipient: "Bolnica",
        TaxId: "123456789",
        Destination: "Beograd",
        Date: "2026-10-01",
        SKU: "ART-1",
        Quantity: "2",
        Unit: "kom",
      },
      {
        Number: number,
        Recipient: "",
        TaxId: "",
        Destination: "",
        Date: "",
        SKU: "ART-2",
        Quantity: "3",
        Unit: "kom",
      },
    ];
    const mapping = {
      Number: "number",
      Recipient: "recipientName",
      TaxId: "recipientTaxId",
      Destination: "destination",
      Date: "plannedAt",
      SKU: "sku",
      Quantity: "quantity",
      Unit: "unit",
    } as const;
    const result = await importShipments(actor, "multi.csv", rows, mapping);
    expect(result).toMatchObject({
      imported: 2,
      importedShipments: 1,
      errors: 0,
    });
    const [shipment] = await db
      .select()
      .from(shipments)
      .where(
        and(
          eq(shipments.organizationId, organization.id),
          eq(shipments.number, number),
        ),
      );
    expect(shipment.recipientName).toBe("Bolnica");
    expect(shipment.sourceData).toMatchObject({
      rows: [{ rowNumber: 2 }, { rowNumber: 3 }],
    });
    const lines = await db
      .select()
      .from(shipmentLines)
      .where(eq(shipmentLines.shipmentId, shipment.id));
    expect(lines.map((line) => line.sku).sort()).toEqual(["ART-1", "ART-2"]);
    const importedRows = await db
      .select()
      .from(importRows)
      .where(eq(importRows.importJobId, result.id));
    expect(importedRows.map((row) => row.shipmentId)).toEqual([
      shipment.id,
      shipment.id,
    ]);
    const repeated = await importShipments(actor, "multi.csv", rows, mapping);
    expect(repeated).toMatchObject({
      imported: 0,
      importedShipments: 0,
      errors: 2,
    });

    const conflictedNumber = `CONFLICT-${suffix}`;
    const conflicted = await importShipments(
      actor,
      "conflict.csv",
      [
        { ...rows[0], Number: conflictedNumber },
        { ...rows[1], Number: conflictedNumber, TaxId: "987654321" },
      ],
      mapping,
    );
    expect(conflicted).toMatchObject({
      imported: 0,
      importedShipments: 0,
      errors: 2,
    });
    expect(conflicted.rowErrors).toHaveLength(2);
    expect(
      conflicted.rowErrors.every((row) =>
        row.error?.includes("Conflicting recipientTaxId"),
      ),
    ).toBe(true);
    const partialShipments = await db
      .select({ id: shipments.id })
      .from(shipments)
      .where(
        and(
          eq(shipments.organizationId, organization.id),
          eq(shipments.number, conflictedNumber),
        ),
      );
    expect(partialShipments).toHaveLength(0);
  });
  it("recovers a job abandoned by a crashed worker", async () => {
    const { db } = await import("@/db/client");
    const { jobs, organizations } = await import("@/db/schema");
    const { recoverStaleJobs } = await import("@/jobs/queue");
    const suffix = randomUUID().slice(0, 8);
    const [organization] = await db
      .insert(organizations)
      .values({
        name: `Recovery test ${suffix}`,
        slug: `recovery-test-${suffix}`,
      })
      .returning();
    const [job] = await db
      .insert(jobs)
      .values({
        organizationId: organization.id,
        type: "POLL_DOCUMENT",
        entityId: randomUUID(),
        status: "RUNNING",
        lockedAt: new Date(Date.now() - 180_000),
      })
      .returning();
    expect(await recoverStaleJobs()).toBeGreaterThan(0);
    const [recovered] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(recovered.status).toBe("PENDING");
    await db.update(jobs).set({ status: "DONE" }).where(eq(jobs.id, job.id));
  });
  it("retries a known external request by polling, never by resubmitting", async () => {
    const { db } = await import("@/db/client");
    const {
      organizations,
      users,
      shipments,
      dispatchDocuments,
      integrationRequests,
      jobs,
    } = await import("@/db/schema");
    const { retryRequest } = await import("@/services/shipment");
    const suffix = randomUUID().slice(0, 8);
    const [organization] = await db
      .insert(organizations)
      .values({ name: `Polling retry ${suffix}`, slug: `poll-retry-${suffix}` })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        organizationId: organization.id,
        email: `poll-retry-${suffix}@example.invalid`,
        name: "Retry tester",
        role: "OPERATIONS",
        passwordHash: "not-for-login",
      })
      .returning();
    const actor: Actor = {
      id: user.id,
      organizationId: organization.id,
      name: user.name,
      email: user.email,
      role: "OPERATIONS",
    };
    const [shipment] = await db
      .insert(shipments)
      .values({
        organizationId: organization.id,
        number: `POLL-${suffix}`,
        source: "CSV",
        recipientName: "Buyer",
        senderName: organization.name,
        status: "FAILED_TRANSIENT",
        documentStatus: "FAILED_TRANSIENT",
        correlationId: randomUUID(),
      })
      .returning();
    const [document] = await db
      .insert(dispatchDocuments)
      .values({
        organizationId: organization.id,
        shipmentId: shipment.id,
        version: 1,
        status: "PROCESSING",
        payload: {
          schema: "otpremaops-demo-v1",
          shipmentNumber: shipment.number,
          sender: organization.name,
          recipient: { name: "Buyer", taxId: "DEMO" },
          destination: "Belgrade",
          plannedAt: "2026-10-01",
          lines: [
            { sku: "ART-1", description: "Part", quantity: "1", unit: "KOM" },
          ],
        },
        xml: "<demo />",
      })
      .returning();
    const [request] = await db
      .insert(integrationRequests)
      .values({
        organizationId: organization.id,
        shipmentId: shipment.id,
        documentId: document.id,
        operation: "submitDispatch",
        idempotencyKey: `poll-retry-${suffix}`,
        requestId: `external-${suffix}`,
        state: "FAILED_TRANSIENT",
        requestPayload: document.payload,
        correlationId: shipment.correlationId,
      })
      .returning();
    await retryRequest(actor, request.id);
    const queued = await db
      .select()
      .from(jobs)
      .where(eq(jobs.entityId, request.id));
    expect(queued).toHaveLength(1);
    expect(queued[0].type).toBe("POLL_DOCUMENT");
    await expect(retryRequest(actor, request.id)).rejects.toThrow();
  });
  it("counts all tenant shipments and prioritizes an urgent row beyond 500", async () => {
    const { db } = await import("@/db/client");
    const { organizations, shipments, validationIssues } =
      await import("@/db/schema");
    const { getOperationsOverview } = await import("@/services/operations");
    const { queryShipments } = await import("@/services/shipment-list");
    const suffix = randomUUID().slice(0, 8);
    const [organization] = await db
      .insert(organizations)
      .values({ name: `Queue test ${suffix}`, slug: `queue-test-${suffix}` })
      .returning();
    const actor: Actor = {
      id: randomUUID(),
      organizationId: organization.id,
      name: "Queue tester",
      email: `queue-${suffix}@example.invalid`,
      role: "OWNER",
    };
    await db.insert(shipments).values(
      Array.from({ length: 500 }, (_, index) => ({
        organizationId: organization.id,
        number: `BULK-${suffix}-${String(index).padStart(3, "0")}`,
        source: "CSV",
        recipientName: "Regular buyer",
        senderName: organization.name,
        status: "READY",
        correlationId: randomUUID(),
      })),
    );
    const [urgent] = await db
      .insert(shipments)
      .values({
        organizationId: organization.id,
        number: `URGENT-${suffix}`,
        source: "CSV",
        recipientName: "Urgent buyer",
        senderName: organization.name,
        status: "FAILED_TRANSIENT",
        correlationId: randomUUID(),
      })
      .returning();
    await db.insert(validationIssues).values({
      organizationId: organization.id,
      shipmentId: urgent.id,
      category: "INTEGRATION_REQUIRED",
      code: "RETRY_EXHAUSTED",
      severity: "ERROR",
      explanation: "Retries exhausted",
      recommendedAction: "Inspect request",
    });
    const overview = await getOperationsOverview(actor);
    expect(overview.counts.ready).toBe(500);
    expect(overview.counts.failed).toBe(1);
    expect(overview.queue[0].id).toBe(urgent.id);
    expect(overview.issuesByShipment.get(urgent.id)?.[0]?.code).toBe(
      "RETRY_EXHAUSTED",
    );
    const oldShipment = await queryShipments(
      actor,
      new URLSearchParams({
        page: "1",
        pageSize: "15",
        search: `BULK-${suffix}-000`,
      }),
    );
    expect(oldShipment.total).toBe(1);
    expect(oldShipment.rows[0].number).toBe(`BULK-${suffix}-000`);
    const finalPage = await queryShipments(
      actor,
      new URLSearchParams({
        page: "34",
        pageSize: "15",
        sort: "number",
        desc: "false",
      }),
    );
    expect(finalPage.total).toBe(501);
    expect(finalPage.rows.map((row) => row.id)).toContain(urgent.id);
  });
  it("creates truthful integration cards for a new pilot organization", async () => {
    const { db } = await import("@/db/client");
    const { integrationConnections, organizations } =
      await import("@/db/schema");
    const { createPilotOrganization } = await import("@/services/onboarding");
    const suffix = randomUUID().slice(0, 8);
    const actor: Actor = {
      id: randomUUID(),
      organizationId: randomUUID(),
      name: "Consultant",
      email: "consultant@example.invalid",
      role: "OWNER",
    };
    const result = await createPilotOrganization(actor, {
      name: `Pilot ${suffix}`,
      slug: `pilot-${suffix}`,
      email: `pilot-${suffix}@example.invalid`,
      password: "not-a-production-password",
    });
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, result.organization.id));
    expect(organization.name).toBe(`Pilot ${suffix}`);
    const connections = await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.organizationId, organization.id));
    expect(connections.map((connection) => connection.kind).sort()).toEqual([
      "CSV",
      "EOTPREMNICA",
      "SEF",
    ]);
    expect(
      connections.find((connection) => connection.kind === "EOTPREMNICA"),
    ).toMatchObject({ mode: "MOCK", state: "CONNECTED" });
    expect(
      connections.find((connection) => connection.kind === "SEF"),
    ).toMatchObject({ state: "LIMITED" });
  });
  it("cancels an unsent shipment and closes its open issues", async () => {
    const { db } = await import("@/db/client");
    const { organizations, shipments, users, validationIssues, auditEvents } =
      await import("@/db/schema");
    const { cancelShipment } = await import("@/services/shipment");
    const suffix = randomUUID().slice(0, 8);
    const [organization] = await db
      .insert(organizations)
      .values({ name: `Cancel test ${suffix}`, slug: `cancel-test-${suffix}` })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        organizationId: organization.id,
        name: "Cancel tester",
        email: `cancel-${suffix}@example.invalid`,
        role: "OPERATIONS",
        passwordHash: "not-for-login",
      })
      .returning();
    const actor: Actor = {
      id: user.id,
      organizationId: organization.id,
      name: user.name,
      email: user.email,
      role: "OPERATIONS",
    };
    const [shipment] = await db
      .insert(shipments)
      .values({
        organizationId: organization.id,
        number: `CANCEL-${suffix}`,
        source: "CSV",
        recipientName: "Kupac",
        senderName: "Pošiljalac",
        status: "IMPORTED",
        correlationId: randomUUID(),
      })
      .returning();
    await db.insert(validationIssues).values({
      organizationId: organization.id,
      shipmentId: shipment.id,
      category: "INTERNAL_REQUIRED",
      code: "DESTINATION_REQUIRED",
      severity: "ERROR",
      explanation: "Missing address",
      recommendedAction: "Add address",
    });
    await cancelShipment(actor, shipment.id);
    const [saved] = await db
      .select()
      .from(shipments)
      .where(eq(shipments.id, shipment.id));
    const [issue] = await db
      .select()
      .from(validationIssues)
      .where(eq(validationIssues.shipmentId, shipment.id));
    expect(saved.status).toBe("CANCELLED");
    expect(issue.status).toBe("RESOLVED");
    expect(
      (
        await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.correlationId, shipment.correlationId))
      ).map((x) => x.action),
    ).toContain("shipment.cancelled");
  });
});
