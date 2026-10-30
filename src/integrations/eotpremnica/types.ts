import type {
  ShipmentForValidation,
  ValidationResult,
} from "@/domain/validation";

export type EotpremnicaDocumentDTO = {
  schema: "otpremaops-demo-v1";
  shipmentNumber: string;
  sender: string;
  recipient: { name: string; taxId: string };
  destination: string;
  plannedAt: string;
  lines: { sku: string; description: string; quantity: string; unit: string }[];
};
export type SubmitResult = { requestId: string; state: "PROCESSING" };
export type StatusResult = {
  state: "PROCESSING" | "ACCEPTED" | "REJECTED";
  documentId?: string;
  code?: string;
  message?: string;
  payload: Record<string, unknown>;
};
export interface EotpremnicaAdapter {
  mode: "MOCK" | "SANDBOX" | "PRODUCTION";
  validateShipment(input: ShipmentForValidation): Promise<ValidationResult>;
  createDispatchDocument(
    dto: EotpremnicaDocumentDTO,
  ): Promise<Record<string, unknown>>;
  submitDispatch(
    dto: EotpremnicaDocumentDTO,
    idempotencyKey: string,
    attempt: number,
  ): Promise<SubmitResult>;
  getRequestStatus(
    requestId: string,
    dto: EotpremnicaDocumentDTO,
  ): Promise<StatusResult>;
  getDocument(documentId: string): Promise<Record<string, unknown>>;
  getChanges(): Promise<Record<string, unknown>[]>;
  cancelDocument(documentId: string): Promise<void>;
  downloadPayload(dto: EotpremnicaDocumentDTO): Promise<string>;
  healthCheck(): Promise<{ ok: boolean; mode: string }>;
}
