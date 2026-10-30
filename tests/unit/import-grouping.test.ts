import { describe, expect, it } from "vitest";
import { groupMappedRows, type MappedImportRow } from "@/domain/mapping";

const row = (changes: Partial<MappedImportRow> = {}): MappedImportRow => ({
  externalId: "EXT-1",
  number: "OT-1",
  recipientName: "Bolnica",
  recipientTaxId: "123456789",
  destination: "Beograd",
  plannedAt: "2026-10-01",
  senderName: "Dobavljač",
  shipFrom: "Novi Sad",
  transport: "Kombi",
  sku: "ART-1",
  description: "Prva stavka",
  quantity: "2",
  unit: "kom",
  ...changes,
});

describe("mapped shipment grouping", () => {
  it("imports repeated shipment numbers as separate lines and accepts sparse shared fields", () => {
    const groups = groupMappedRows([
      row(),
      row({
        externalId: "",
        recipientName: "",
        recipientTaxId: "",
        destination: "",
        plannedAt: "",
        senderName: "",
        shipFrom: "",
        transport: "",
        sku: "ART-2",
        quantity: "3,5",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rowIndexes).toEqual([0, 1]);
    expect(groups[0].lines.map((line) => line.sku)).toEqual(["ART-1", "ART-2"]);
    expect(groups[0].shipment.recipientName).toBe("Bolnica");
    expect(groups[0].errors).toEqual([]);
  });

  it("rejects the entire shipment when shared fields conflict or a line is invalid", () => {
    const [group] = groupMappedRows([
      row(),
      row({ recipientTaxId: "987654321", sku: "ART-2", quantity: "0" }),
    ]);
    expect(group.rowIndexes).toEqual([0, 1]);
    expect(group.errors).toEqual(
      expect.arrayContaining([
        "Row 3: Conflicting recipientTaxId in shipment",
        "Row 3: Quantity must be greater than zero",
      ]),
    );
  });

  it("accepts an additional line identified only by its external ID", () => {
    const groups = groupMappedRows([
      row(),
      row({ number: "", recipientName: "", sku: "ART-2" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[0].errors).toEqual([]);
  });

  it("detects the same external ID assigned to different shipment numbers", () => {
    const groups = groupMappedRows([row(), row({ number: "OT-2" })]);
    expect(groups).toHaveLength(2);
    expect(
      groups.every((group) =>
        group.errors.includes("Duplicate external shipment ID in this file"),
      ),
    ).toBe(true);
  });

  it("accepts external-ID-only shipments and fills header fields from later lines", () => {
    const [group] = groupMappedRows([
      row({ number: "", recipientName: "", destination: "" }),
      row({ number: "", sku: "ART-2" }),
    ]);
    expect(group.lines).toHaveLength(2);
    expect(group.shipment.recipientName).toBe("Bolnica");
    expect(group.shipment.destination).toBe("Beograd");
    expect(group.errors).toEqual([]);
  });

  it("does not silently attach an unidentified line to the previous shipment", () => {
    const groups = groupMappedRows([
      row(),
      row({ number: "", externalId: "", sku: "ART-2" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1].errors).toContain(
      "Row 3: Shipment number or external ID is required",
    );
  });

  it("rejects both groups when a row bridges inconsistent identifiers", () => {
    const groups = groupMappedRows([
      row({ externalId: "" }),
      row({ number: "OT-2", externalId: "EXT-2" }),
      row({ number: "OT-1", externalId: "EXT-2", sku: "ART-2" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(
      groups.every((group) =>
        group.errors.some((error) =>
          error.includes("Conflicting shipment identifiers"),
        ),
      ),
    ).toBe(true);
  });
});
