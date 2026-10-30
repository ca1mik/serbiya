import { createHash } from "node:crypto";
import { validateShipment } from "@/domain/validation";
import { AppError } from "@/lib/errors";
import { serializeDemoXml } from "./xml";
import type {
  EotpremnicaAdapter,
  EotpremnicaDocumentDTO,
  StatusResult,
  SubmitResult,
} from "./types";

export class MockEotpremnicaAdapter implements EotpremnicaAdapter {
  readonly mode = "MOCK";
  async validateShipment(
    input: Parameters<EotpremnicaAdapter["validateShipment"]>[0],
  ) {
    return validateShipment(input);
  }
  async createDispatchDocument(dto: EotpremnicaDocumentDTO) {
    return { ...dto, demo: true };
  }
  async submitDispatch(
    dto: EotpremnicaDocumentDTO,
    key: string,
    attempt: number,
  ): Promise<SubmitResult> {
    if (dto.recipient.name.includes("Demo Timeout") && attempt === 1)
      throw new AppError(
        "TRANSIENT",
        "Mock timeout; retry scheduled",
        503,
        "TIMEOUT",
      );
    return { requestId: `mock-req-${key.slice(0, 20)}`, state: "PROCESSING" };
  }
  async getRequestStatus(
    requestId: string,
    dto: EotpremnicaDocumentDTO,
  ): Promise<StatusResult> {
    if (dto.lines.some((line) => line.sku === "SKU-DEMO-FAIL"))
      return {
        state: "REJECTED",
        code: "DEMO_SKU_REJECTED",
        message:
          "Demo rejection: SKU-DEMO-FAIL is reserved for failure testing.",
        payload: { requestId, demo: true },
      };
    const hash = createHash("sha256")
      .update(requestId)
      .digest("hex")
      .slice(0, 20);
    return {
      state: "ACCEPTED",
      documentId: `mock-doc-${hash}`,
      payload: { requestId, demo: true, acceptedAt: new Date().toISOString() },
    };
  }
  async getDocument(documentId: string) {
    return { documentId, demo: true };
  }
  async getChanges() {
    return [];
  }
  async cancelDocument() {
    return;
  }
  async downloadPayload(dto: EotpremnicaDocumentDTO) {
    return serializeDemoXml(dto);
  }
  async healthCheck() {
    return { ok: true, mode: this.mode };
  }
}
class UnconfiguredAdapter implements EotpremnicaAdapter {
  constructor(readonly mode: "SANDBOX" | "PRODUCTION") {}
  private fail(): never {
    throw new AppError(
      "CONFIGURATION",
      `${this.mode} eOtpremnica adapter requires a verified endpoint, credentials, and current official API mapping`,
      503,
    );
  }
  async validateShipment(): Promise<never> {
    return this.fail();
  }
  async createDispatchDocument(): Promise<never> {
    return this.fail();
  }
  async submitDispatch(): Promise<never> {
    return this.fail();
  }
  async getRequestStatus(): Promise<never> {
    return this.fail();
  }
  async getDocument(): Promise<never> {
    return this.fail();
  }
  async getChanges(): Promise<never> {
    return this.fail();
  }
  async cancelDocument(): Promise<never> {
    return this.fail();
  }
  async downloadPayload(): Promise<never> {
    return this.fail();
  }
  async healthCheck(): Promise<never> {
    return this.fail();
  }
}
export class SandboxEotpremnicaAdapter extends UnconfiguredAdapter {
  constructor() {
    super("SANDBOX");
  }
}
export class ProductionEotpremnicaAdapter extends UnconfiguredAdapter {
  constructor() {
    super("PRODUCTION");
  }
}
export function getEotpremnicaAdapter(): EotpremnicaAdapter {
  const mode = (process.env.EOTPREMNICA_MODE ?? "mock").toLowerCase();
  if (mode === "mock") return new MockEotpremnicaAdapter();
  if (mode === "sandbox") return new SandboxEotpremnicaAdapter();
  if (mode === "production") return new ProductionEotpremnicaAdapter();
  throw new AppError(
    "CONFIGURATION",
    `Unsupported EOTPREMNICA_MODE: ${mode}`,
    503,
  );
}
