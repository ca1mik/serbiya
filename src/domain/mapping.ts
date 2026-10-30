import { z } from "zod";
import Decimal from "decimal.js";

export const targetFields = [
  "externalId",
  "number",
  "recipientName",
  "recipientTaxId",
  "destination",
  "plannedAt",
  "senderName",
  "shipFrom",
  "transport",
  "sku",
  "description",
  "quantity",
  "unit",
] as const;
export const mappingSchema = z
  .record(z.string().min(1), z.enum(targetFields))
  .refine(
    (mapping) =>
      new Set(Object.values(mapping)).size === Object.values(mapping).length,
    "Each destination field can be mapped only once",
  );
export type Mapping = z.infer<typeof mappingSchema>;
export type MappedImportRow = {
  externalId: string;
  number: string;
  recipientName: string;
  recipientTaxId: string;
  destination: string;
  plannedAt: string;
  senderName: string;
  shipFrom: string;
  transport: string;
  sku: string;
  description: string;
  quantity: string;
  unit: string;
};
export function mapRow(
  source: Record<string, string>,
  mapping: Mapping,
): MappedImportRow {
  const result: Record<string, string> = Object.fromEntries(
    targetFields.map((field) => [field, ""]),
  );
  for (const [header, target] of Object.entries(mapping))
    result[target] = String(source[header] ?? "").trim();
  return result as MappedImportRow;
}
export function validateMappedRow(row: MappedImportRow): string[] {
  const errors: string[] = [];
  if (!row.recipientName) errors.push("Recipient name is required");
  if (!row.number && !row.externalId)
    errors.push("Shipment number or external ID is required");
  return [...errors, ...validateMappedLine(row)];
}

function validateMappedLine(row: MappedImportRow): string[] {
  const errors: string[] = [];
  if (!row.sku) errors.push("SKU is required");
  try {
    if (
      !new Decimal(row.quantity.replace(",", ".")).isFinite() ||
      new Decimal(row.quantity.replace(",", ".")).lte(0)
    )
      throw new Error("invalid");
  } catch {
    errors.push("Quantity must be greater than zero");
  }
  if (!row.unit) errors.push("Unit is required");
  return errors;
}

export type MappedShipmentGroup = {
  rowIndexes: number[];
  shipment: MappedImportRow;
  lines: MappedImportRow[];
  errors: string[];
};

const sharedFields = [
  "externalId",
  "number",
  "recipientName",
  "recipientTaxId",
  "destination",
  "plannedAt",
  "senderName",
  "shipFrom",
  "transport",
] as const;

/** Repeated shipment numbers or external IDs identify lines of one dispatch. */
export function groupMappedRows(
  rows: MappedImportRow[],
): MappedShipmentGroup[] {
  const byNumber = new Map<string, MappedShipmentGroup>();
  const byExternalId = new Map<string, MappedShipmentGroup>();
  const groups: MappedShipmentGroup[] = [];
  rows.forEach((row, index) => {
    const numberGroup = row.number ? byNumber.get(row.number) : undefined;
    const externalGroup = row.externalId
      ? byExternalId.get(row.externalId)
      : undefined;
    let group = numberGroup;
    if (
      !group &&
      externalGroup &&
      (!row.number ||
        !externalGroup.shipment.number ||
        externalGroup.shipment.number === row.number)
    )
      group = externalGroup;
    if (!group) {
      group = {
        rowIndexes: [],
        shipment: { ...row },
        lines: [],
        errors: [],
      };
      groups.push(group);
    }
    if (numberGroup && externalGroup && numberGroup !== externalGroup) {
      numberGroup.errors.push(
        `Row ${index + 2}: Conflicting shipment identifiers`,
      );
      externalGroup.errors.push(
        `Row ${index + 2}: Conflicting shipment identifiers`,
      );
    }
    if (row.number && !byNumber.has(row.number))
      byNumber.set(row.number, group);
    if (row.externalId && !byExternalId.has(row.externalId))
      byExternalId.set(row.externalId, group);
    group.rowIndexes.push(index);
    group.lines.push(row);
    if (!row.number && !row.externalId)
      group.errors.push(
        `Row ${index + 2}: Shipment number or external ID is required`,
      );
    for (const field of sharedFields) {
      const value = row[field];
      if (!value) continue;
      const current = group.shipment[field];
      if (current && current !== value)
        group.errors.push(`Row ${index + 2}: Conflicting ${field} in shipment`);
      else group.shipment[field] = value;
    }
  });

  const seenExternalIds = new Map<string, MappedShipmentGroup>();
  for (const group of groups) {
    if (!group.shipment.recipientName)
      group.errors.push("Recipient name is required");
    group.lines.forEach((line, index) => {
      const rowNumber = group.rowIndexes[index] + 2;
      group.errors.push(
        ...validateMappedLine(line).map(
          (error) => `Row ${rowNumber}: ${error}`,
        ),
      );
    });
    const externalId = group.shipment.externalId || group.shipment.number;
    if (!externalId) continue;
    const previous = seenExternalIds.get(externalId);
    if (previous && previous !== group) {
      previous.errors.push("Duplicate external shipment ID in this file");
      group.errors.push("Duplicate external shipment ID in this file");
    } else seenExternalIds.set(externalId, group);
  }
  return groups;
}
