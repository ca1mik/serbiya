import type { EotpremnicaDocumentDTO } from "./types";
const esc = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
/** Internal demo XML only. This is not an official Serbian UBL schema. */
export function serializeDemoXml(dto: EotpremnicaDocumentDTO): string {
  const lines = dto.lines
    .map(
      (line) =>
        `<Line><SKU>${esc(line.sku)}</SKU><Description>${esc(line.description)}</Description><Quantity unit="${esc(line.unit)}">${esc(line.quantity)}</Quantity></Line>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><OtpremaOpsDemoDispatch schema="${dto.schema}"><Shipment>${esc(dto.shipmentNumber)}</Shipment><Sender>${esc(dto.sender)}</Sender><Recipient taxId="${esc(dto.recipient.taxId)}">${esc(dto.recipient.name)}</Recipient><Destination>${esc(dto.destination)}</Destination><PlannedAt>${esc(dto.plannedAt)}</PlannedAt><Lines>${lines}</Lines></OtpremaOpsDemoDispatch>`;
}
