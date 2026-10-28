import { describe, expect, it } from "vitest";
import { hashPassword, passwordIsStrong, tokenHash, verifyPassword } from "./auth";

describe("GastroConecta authentication", () => {
  it("requires a strong password and verifies the scrypt record", async () => {
    const password = "Gastro!Connecta2026";
    expect(passwordIsStrong(password)).toBe(true);
    expect(passwordIsStrong("password123")).toBe(false);
    const stored = await hashPassword(password);
    expect(stored.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword(password, stored)).toBe(true);
    expect(await verifyPassword(`${password}!`, stored)).toBe(false);
  });

  it("stores only a deterministic one-way token digest", () => {
    const token = "opaque-session-token";
    expect(tokenHash(token)).toHaveLength(64);
    expect(tokenHash(token)).toBe(tokenHash(token));
    expect(tokenHash(token)).not.toContain(token);
  });
});
