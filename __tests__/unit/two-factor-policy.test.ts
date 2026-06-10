import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isTwoFactorEnforced, sessionRequiresTwoFactor } from "@/lib/auth/two-factor-policy";

const ORIGINAL_ENFORCE = process.env.TWO_FACTOR_ENFORCE;
const ORIGINAL_SECRET = process.env.NEXTAUTH_SECRET;

function session(opts: { isSuperAdmin?: boolean; roles?: string[] }) {
  return {
    user: { isSuperAdmin: opts.isSuperAdmin ?? false },
    availableTenants: (opts.roles ?? []).map((role) => ({ role })),
  };
}

describe("two-factor-policy", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "x";
  });
  afterEach(() => {
    process.env.TWO_FACTOR_ENFORCE = ORIGINAL_ENFORCE;
    process.env.NEXTAUTH_SECRET = ORIGINAL_SECRET;
  });

  describe("isTwoFactorEnforced", () => {
    it("false por padrão (flag desligada)", () => {
      delete process.env.TWO_FACTOR_ENFORCE;
      expect(isTwoFactorEnforced()).toBe(false);
    });

    it("true só com a flag E auth configurada", () => {
      process.env.TWO_FACTOR_ENFORCE = "true";
      expect(isTwoFactorEnforced()).toBe(true);
      delete process.env.NEXTAUTH_SECRET;
      expect(isTwoFactorEnforced()).toBe(false);
    });
  });

  describe("sessionRequiresTwoFactor", () => {
    it("superadmin sempre exige", () => {
      expect(sessionRequiresTwoFactor(session({ isSuperAdmin: true }))).toBe(true);
    });

    it("admin de tenant exige (qualquer papel admin)", () => {
      expect(sessionRequiresTwoFactor(session({ roles: ["MANAGER"] }))).toBe(true);
      expect(sessionRequiresTwoFactor(session({ roles: ["seller", "owner"] }))).toBe(true);
    });

    it("usuário comum não exige", () => {
      expect(sessionRequiresTwoFactor(session({ roles: ["SELLER", "TECH"] }))).toBe(false);
      expect(sessionRequiresTwoFactor(session({ roles: [] }))).toBe(false);
    });
  });
});
