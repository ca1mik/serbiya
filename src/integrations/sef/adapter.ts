export interface SefAdapter {
  mode: "MOCK" | "SANDBOX" | "PRODUCTION";
  getInvoiceReference(dispatchId: string): Promise<string | null>;
}
export class MockSefAdapter implements SefAdapter {
  readonly mode = "MOCK";
  async getInvoiceReference() {
    return null;
  }
}
