import { describe, expect, it } from "vitest";
import { generateResetToken, hashResetToken } from "@/lib/auth/reset-token";

describe("password reset token hashing", () => {
  it("never stores the plaintext token", () => {
    const token = generateResetToken();
    const stored = hashResetToken(token);
    // The value persisted to the DB must differ from the value emailed to the user.
    expect(stored).not.toBe(token);
  });

  it("is deterministic so lookup by re-hashing the input matches the stored hash", () => {
    const token = generateResetToken();
    const stored = hashResetToken(token);
    // resetPassword hashes the incoming plaintext and looks it up — must match.
    expect(hashResetToken(token)).toBe(stored);
  });

  it("produces a 64-char hex SHA-256 digest", () => {
    expect(hashResetToken("any-token")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("maps distinct tokens to distinct hashes", () => {
    expect(hashResetToken(generateResetToken())).not.toBe(
      hashResetToken(generateResetToken()),
    );
  });

  it("generates unique tokens", () => {
    expect(generateResetToken()).not.toBe(generateResetToken());
  });
});
