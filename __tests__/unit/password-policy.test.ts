/**
 * validatePasswordPolicy (D4): aplica a politica de senha do tenant
 * (TenantSecuritySettings) nas trocas de senha. Antes a config era salva mas
 * ignorada — o sistema aceitava 6 chars independentemente.
 */
import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { validatePasswordPolicy, type PasswordPolicy } from "@/lib/password";
import {
  resolveUserPasswordPolicy,
  DEFAULT_PASSWORD_POLICY,
} from "@/server/services/password-policy.service";

const base: PasswordPolicy = {
  minPasswordLength: 8,
  requireUppercase: false,
  requireNumber: false,
  requireSpecialChar: false,
};

describe("validatePasswordPolicy", () => {
  it("aceita senha que cumpre a politica (OK = null)", () => {
    expect(validatePasswordPolicy("abcdefgh", base)).toBeNull();
  });

  it("rejeita abaixo do tamanho minimo", () => {
    expect(validatePasswordPolicy("abc", base)).toMatch(/ao menos 8 caracteres/);
    // limite exato: 8 passa, 7 nao.
    expect(validatePasswordPolicy("1234567", { ...base, minPasswordLength: 8 })).toMatch(/8 caracteres/);
    expect(validatePasswordPolicy("12345678", { ...base, minPasswordLength: 8 })).toBeNull();
  });

  it("exige maiuscula quando requireUppercase", () => {
    const p = { ...base, requireUppercase: true };
    expect(validatePasswordPolicy("semmaiuscula1", p)).toMatch(/maiuscula/);
    expect(validatePasswordPolicy("ComMaiuscula", p)).toBeNull();
  });

  it("exige numero quando requireNumber", () => {
    const p = { ...base, requireNumber: true };
    expect(validatePasswordPolicy("semnumeros", p)).toMatch(/numero/);
    expect(validatePasswordPolicy("comnumero1", p)).toBeNull();
  });

  it("exige caractere especial quando requireSpecialChar", () => {
    const p = { ...base, requireSpecialChar: true };
    expect(validatePasswordPolicy("semespecial1", p)).toMatch(/especial/);
    expect(validatePasswordPolicy("comespecial!", p)).toBeNull();
  });

  it("politica completa: tudo exigido", () => {
    const strict: PasswordPolicy = {
      minPasswordLength: 12,
      requireUppercase: true,
      requireNumber: true,
      requireSpecialChar: true,
    };
    expect(validatePasswordPolicy("Abc1!", strict)).toMatch(/12 caracteres/); // curta primeiro
    expect(validatePasswordPolicy("abcdefghijk1!", strict)).toMatch(/maiuscula/);
    expect(validatePasswordPolicy("Abcdefghijkl!", strict)).toMatch(/numero/);
    expect(validatePasswordPolicy("Abcdefghijkl1", strict)).toMatch(/especial/);
    expect(validatePasswordPolicy("Abcdefghijk1!", strict)).toBeNull();
  });
});

/**
 * resolveUserPasswordPolicy (A3): reset de senha público exige a política mais
 * estrita entre os tenants do usuário (senha é global). Sem isto, o reset furava
 * a política que o changePassword aplica.
 */
type SettingsRow = { tenantId: string } & PasswordPolicy;
function mockTx(memberTenantIds: string[], settings: SettingsRow[]): PrismaClient {
  return {
    userTenant: { findMany: async () => memberTenantIds.map((tenantId) => ({ tenantId })) },
    tenantSecuritySettings: { findMany: async () => settings },
  } as unknown as PrismaClient;
}

describe("resolveUserPasswordPolicy", () => {
  it("sem membership → DEFAULT", async () => {
    const p = await resolveUserPasswordPolicy(mockTx([], []), "u1");
    expect(p).toEqual(DEFAULT_PASSWORD_POLICY);
  });

  it("tenant sem linha de settings → DEFAULT para ele", async () => {
    const p = await resolveUserPasswordPolicy(mockTx(["t1"], []), "u1");
    expect(p).toEqual(DEFAULT_PASSWORD_POLICY);
  });

  it("usa a política do único tenant quando existe", async () => {
    const p = await resolveUserPasswordPolicy(
      mockTx(["t1"], [
        { tenantId: "t1", minPasswordLength: 12, requireUppercase: true, requireNumber: false, requireSpecialChar: true },
      ]),
      "u1",
    );
    expect(p).toEqual({
      minPasswordLength: 12,
      requireUppercase: true,
      requireNumber: false,
      requireSpecialChar: true,
    });
  });

  it("multi-tenant: exige a MAIS estrita (max length + OR dos requisitos)", async () => {
    const p = await resolveUserPasswordPolicy(
      mockTx(["t1", "t2"], [
        { tenantId: "t1", minPasswordLength: 10, requireUppercase: true, requireNumber: false, requireSpecialChar: false },
        { tenantId: "t2", minPasswordLength: 14, requireUppercase: false, requireNumber: false, requireSpecialChar: true },
      ]),
      "u1",
    );
    expect(p).toEqual({
      minPasswordLength: 14,
      requireUppercase: true,
      requireNumber: false,
      requireSpecialChar: true,
    });
  });

  it("mistura tenant-com-settings + tenant-sem-linha (DEFAULT): pega o mais estrito", async () => {
    // t2 sem linha → DEFAULT (min 8, requireNumber). t1 min 6 sem requireNumber.
    // Estrito: max(6,8)=8; requireNumber (do DEFAULT) = true.
    const p = await resolveUserPasswordPolicy(
      mockTx(["t1", "t2"], [
        { tenantId: "t1", minPasswordLength: 6, requireUppercase: false, requireNumber: false, requireSpecialChar: false },
      ]),
      "u1",
    );
    expect(p.minPasswordLength).toBe(8);
    expect(p.requireNumber).toBe(true);
  });
});
