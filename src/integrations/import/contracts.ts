export interface ImportSourceAdapter {
  kind: "CSV" | "XLSX" | "REST" | "SQL" | "SFTP" | "LEGACY_ERP";
  preview(input: Uint8Array): Promise<Record<string, string>[]>;
}
export class UnconfiguredImportAdapter implements ImportSourceAdapter {
  constructor(readonly kind: "REST" | "SQL" | "SFTP") {}
  async preview(): Promise<never> {
    throw new Error(
      `${this.kind} connector requires a configured read-only adapter and environment-backed credentials`,
    );
  }
}
export class RestSourceAdapter extends UnconfiguredImportAdapter {
  constructor() {
    super("REST");
  }
}
export class ReadOnlySqlSourceAdapter extends UnconfiguredImportAdapter {
  constructor() {
    super("SQL");
  }
}
export class SftpSourceAdapter extends UnconfiguredImportAdapter {
  constructor() {
    super("SFTP");
  }
}
