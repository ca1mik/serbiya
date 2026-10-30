import { describe, expect, it } from "vitest";
import { safeJson } from "@/lib/security";

describe("safe JSON responses", () => {
  it("preserves timestamps and redacts imported secret columns", () => {
    expect(
      safeJson({
        updatedAt: new Date("2026-09-25T10:30:00.000Z"),
        sourceData: {
          API_KEY: "key-value",
          lozinka: "password-value",
          shipment: "OT-1",
        },
      }),
    ).toEqual({
      updatedAt: "2026-09-25T10:30:00.000Z",
      sourceData: {
        API_KEY: "[REDACTED]",
        lozinka: "[REDACTED]",
        shipment: "OT-1",
      },
    });
  });
  it("never invokes a nested toJSON method that could bypass redaction", () => {
    const sanitized = safeJson({
      payload: {
        password: "private",
        toJSON() {
          return { password: "private" };
        },
      },
    });
    expect(JSON.stringify(sanitized)).toBe(
      '{"payload":{"password":"[REDACTED]"}}',
    );
  });
});
