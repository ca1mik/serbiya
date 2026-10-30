import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseImportFile } from "@/integrations/import/parser";
import { groupMappedRows, mapRow } from "@/domain/mapping";

describe("file import parser", () => {
  it("reads the committed Serbian Latin CSV and XLSX fixtures", async () => {
    const csv = await parseImportFile(
      "valid_shipments.csv",
      new Uint8Array(await readFile("examples/imports/valid_shipments.csv")),
    );
    const xlsx = await parseImportFile(
      "valid_shipments.xlsx",
      new Uint8Array(await readFile("examples/imports/valid_shipments.xlsx")),
    );
    expect(csv).toHaveLength(3);
    expect(xlsx).toHaveLength(3);
    expect(xlsx[0]["Broj otpremnice"]).toBe(csv[0]["Broj otpremnice"]);
    expect(xlsx[0]["Šifra artikla"]).toBe("ART-001");
  });
  it("rejects unsupported and oversized uploads", async () => {
    await expect(
      parseImportFile("test.xml", new Uint8Array([1])),
    ).rejects.toThrow("Only CSV and XLSX");
    await expect(
      parseImportFile("test.csv", new Uint8Array(2 * 1024 * 1024 + 1)),
    ).rejects.toThrow("2 MB");
  });
  it("parses the downloadable multi-line example into two shipments", async () => {
    const rows = await parseImportFile(
      "multiline_shipments.csv",
      new Uint8Array(
        await readFile("examples/imports/multiline_shipments.csv"),
      ),
    );
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
    const groups = groupMappedRows(rows.map((row) => mapRow(row, mapping)));
    expect(groups.map((group) => group.lines.length)).toEqual([2, 1]);
    expect(groups.every((group) => group.errors.length === 0)).toBe(true);
  });
});
