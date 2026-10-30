import { describe, expect, it } from "vitest";
import { validateShipment } from "@/domain/validation";
import { assertTransition, attentionPriority } from "@/domain/status";
import { mapRow, mappingSchema, validateMappedRow } from "@/domain/mapping";
import { submissionKey } from "@/domain/idempotency";
import { classifyFailure, retryDelayMs } from "@/domain/retry";
import {
  MockEotpremnicaAdapter,
  ProductionEotpremnicaAdapter,
} from "@/integrations/eotpremnica/adapters";
import { serializeDemoXml } from "@/integrations/eotpremnica/xml";

const base = {
  senderName: "Demo pošiljalac",
  recipientName: "Kupac",
  recipientTaxId: "DEMO-PIB",
  destination: "Radna 1",
  plannedAt: new Date("2026-10-01"),
  externalId: "ERP-1",
  lines: [
    {
      sku: "ART-001",
      quantity: "2.5",
      sourceUnit: "kom",
      normalizedUnit: "KOM",
    },
  ],
};
describe("shipment domain", () => {
  it("distinguishes blocking data from a warning", () => {
    const result = validateShipment({
      ...base,
      recipientTaxId: null,
      externalId: null,
      lines: [{ ...base.lines[0], normalizedUnit: null, quantity: "0" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        "RECIPIENT_TAX_ID_REQUIRED",
        "UNIT_MAPPING_MISSING",
        "INVALID_QUANTITY",
      ]),
    );
    expect(result.warnings[0]?.code).toBe("NO_EXTERNAL_ID");
  });
  it("allows documented transitions and rejects skipping submission", () => {
    expect(() => assertTransition("READY", "QUEUED")).not.toThrow();
    expect(() => assertTransition("READY", "ACCEPTED")).toThrow();
    expect(attentionPriority("FAILED_TRANSIENT", null)).toBeLessThan(
      attentionPriority("NEEDS_DATA", null),
    );
  });
  it("maps source columns and preserves validation errors", () => {
    const row = mapRow(
      {
        Kupac: "Kupac",
        Kolicina: "bad",
        JM: "kom",
        Broj: "OT-1",
        SKU: "ART-1",
      },
      {
        Kupac: "recipientName",
        Kolicina: "quantity",
        JM: "unit",
        Broj: "number",
        SKU: "sku",
      },
    );
    expect(row.recipientName).toBe("Kupac");
    expect(validateMappedRow(row)).toContain(
      "Quantity must be greater than zero",
    );
  });
  it("rejects ambiguous duplicate import mappings", () => {
    expect(
      mappingSchema.safeParse({ Customer: "recipientName", Buyer: "recipientName" })
        .success,
    ).toBe(false);
  });
  it("uses stable payload hashing for idempotency", () => {
    expect(submissionKey("o", "s", "submit", 1, { a: 1, b: 2 })).toBe(
      submissionKey("o", "s", "submit", 1, { b: 2, a: 1 }),
    );
    expect(submissionKey("o", "s", "submit", 1, { a: 1 })).not.toBe(
      submissionKey("o", "s", "submit", 2, { a: 1 }),
    );
  });
  it("classifies retries", () => {
    expect(classifyFailure("TIMEOUT")).toBe("TRANSIENT");
    expect(classifyFailure("AUTH", 401)).toBe("CONFIGURATION");
    expect(classifyFailure("BAD_FIELD", 400)).toBe("REJECTION");
    expect(classifyFailure("CONFIGURATION", 503)).toBe("CONFIGURATION");
    expect(classifyFailure("UNKNOWN")).toBe("TRANSIENT");
    expect(retryDelayMs(3)).toBeGreaterThan(retryDelayMs(2));
  });
});
describe("eOtpremnica boundary", () => {
  const dto = {
    schema: "otpremaops-demo-v1" as const,
    shipmentNumber: "OT-1",
    sender: "Demo",
    recipient: { name: "Kupac", taxId: "DEMO" },
    destination: "Radna 1",
    plannedAt: "2026-10-01",
    lines: [
      { sku: "ART-1", description: "A&B <demo>", quantity: "2", unit: "KOM" },
    ],
  };
  it("returns deterministic mock request and acceptance", async () => {
    const adapter = new MockEotpremnicaAdapter();
    const submission = await adapter.submitDispatch(dto, "key", 1);
    expect(submission.requestId).toContain("mock-req-");
    expect(
      (await adapter.getRequestStatus(submission.requestId, dto)).state,
    ).toBe("ACCEPTED");
  });
  it("rejects demo failure SKU and retries timeout only after first attempt", async () => {
    const adapter = new MockEotpremnicaAdapter();
    expect(
      (
        await adapter.getRequestStatus("mock-req", {
          ...dto,
          lines: [{ ...dto.lines[0], sku: "SKU-DEMO-FAIL" }],
        })
      ).state,
    ).toBe("REJECTED");
    await expect(
      adapter.submitDispatch(
        { ...dto, recipient: { ...dto.recipient, name: "Demo Timeout Kupac" } },
        "key",
        1,
      ),
    ).rejects.toThrow("timeout");
    await expect(
      adapter.submitDispatch(
        { ...dto, recipient: { ...dto.recipient, name: "Demo Timeout Kupac" } },
        "key",
        2,
      ),
    ).resolves.toMatchObject({ state: "PROCESSING" });
  });
  it("escapes XML and refuses unconfigured production", async () => {
    expect(serializeDemoXml(dto)).toContain("A&amp;B &lt;demo&gt;");
    await expect(
      new ProductionEotpremnicaAdapter().healthCheck(),
    ).rejects.toThrow("requires a verified endpoint");
  });
});
