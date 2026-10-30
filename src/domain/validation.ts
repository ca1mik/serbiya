import Decimal from "decimal.js";

export type IssueCategory =
  | "INTERNAL_REQUIRED"
  | "BUSINESS_RULE"
  | "INTEGRATION_REQUIRED"
  | "GOVERNMENT_REJECTION";
export type DomainIssue = {
  category: IssueCategory;
  code: string;
  severity: "ERROR" | "WARNING";
  explanation: string;
  recommendedAction: string;
};
export type ShipmentForValidation = {
  senderName: string;
  recipientName: string;
  recipientTaxId: string | null;
  destination: string | null;
  plannedAt: Date | null;
  externalId: string | null;
  lines: {
    sku: string;
    quantity: string;
    sourceUnit: string;
    normalizedUnit: string | null;
  }[];
};
export type ValidationResult = {
  valid: boolean;
  warnings: DomainIssue[];
  errors: DomainIssue[];
};

export function validateShipment(
  input: ShipmentForValidation,
  duplicateExternalId = false,
): ValidationResult {
  const errors: DomainIssue[] = [];
  const warnings: DomainIssue[] = [];
  const add = (
    category: IssueCategory,
    code: string,
    explanation: string,
    recommendedAction: string,
  ) =>
    errors.push({
      category,
      code,
      explanation,
      recommendedAction,
      severity: "ERROR",
    });
  if (!input.senderName.trim())
    add(
      "INTERNAL_REQUIRED",
      "SENDER_REQUIRED",
      "Sender is missing.",
      "Add a sender company.",
    );
  if (!input.recipientName.trim())
    add(
      "INTERNAL_REQUIRED",
      "RECIPIENT_REQUIRED",
      "Recipient is missing.",
      "Add a recipient.",
    );
  if (!input.recipientTaxId?.trim())
    add(
      "INTEGRATION_REQUIRED",
      "RECIPIENT_TAX_ID_REQUIRED",
      "Recipient tax ID is missing.",
      "Add the recipient tax ID.",
    );
  if (!input.destination?.trim())
    add(
      "INTERNAL_REQUIRED",
      "DESTINATION_REQUIRED",
      "Delivery address is missing.",
      "Add the destination address.",
    );
  if (!input.plannedAt || Number.isNaN(input.plannedAt.getTime()))
    add(
      "INTERNAL_REQUIRED",
      "DISPATCH_DATE_REQUIRED",
      "Planned dispatch date is missing.",
      "Set the planned dispatch date.",
    );
  if (input.lines.length === 0)
    add(
      "INTERNAL_REQUIRED",
      "LINE_REQUIRED",
      "Shipment has no lines.",
      "Add at least one product line.",
    );
  input.lines.forEach((line, index) => {
    if (!line.sku.trim())
      add(
        "BUSINESS_RULE",
        "SKU_REQUIRED",
        `Line ${index + 1} has no product identifier.`,
        "Map or enter a SKU.",
      );
    try {
      if (
        !new Decimal(line.quantity).isFinite() ||
        new Decimal(line.quantity).lte(0)
      )
        throw new Error("invalid");
    } catch {
      add(
        "BUSINESS_RULE",
        "INVALID_QUANTITY",
        `Line ${index + 1} quantity must be greater than zero.`,
        "Correct the quantity.",
      );
    }
    if (!line.normalizedUnit)
      add(
        "INTEGRATION_REQUIRED",
        "UNIT_MAPPING_MISSING",
        `Line ${index + 1} unit '${line.sourceUnit}' has no mapping.`,
        "Create a unit mapping.",
      );
  });
  if (duplicateExternalId)
    add(
      "BUSINESS_RULE",
      "DUPLICATE_EXTERNAL_ID",
      "This source shipment ID was already imported.",
      "Review the existing shipment before reimporting.",
    );
  if (!input.externalId)
    warnings.push({
      category: "BUSINESS_RULE",
      code: "NO_EXTERNAL_ID",
      severity: "WARNING",
      explanation: "No external source ID is present.",
      recommendedAction: "Add a source ID to improve reconciliation.",
    });
  return { valid: errors.length === 0, errors, warnings };
}
