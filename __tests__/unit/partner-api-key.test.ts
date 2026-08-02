/**
 * partner-api-key.service (ADR 0057, Fase 1): emissão → validação → revogação.
 * Banco mockado (in-memory map por keyPrefix); bcrypt REAL (segurança do hash).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface KeyRow {
  id: string;
  tenantId: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  revokedAt: Date | null;
}

const store = new Map<string, KeyRow>(); // por keyPrefix

/**
 * Estado do tenant dono da key. `validatePartnerApiKey` passou a exigir tenant
 * ACTIVE + apiAccessEnabled (auditoria 2026-07-25): antes, key de tenant
 * suspenso/cancelado seguia sacando DePix. Default = elegível, para os casos
 * deste arquivo continuarem exercitando só a lógica de hash/revogação.
 */
const tenantState = new Map<string, { status: string; apiAccessEnabled: boolean }>();
const eligibleTenant = { status: "ACTIVE", apiAccessEnabled: true };

const tx = {
  tenant: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      return tenantState.get(where.id) ?? eligibleTenant;
    }),
  },
  partnerApiKey: {
    create: vi.fn(async ({ data, select: _s }: { data: Omit<KeyRow, "id" | "revokedAt">; select?: unknown }) => {
      const row: KeyRow = { ...data, id: `id-${data.keyPrefix}`, revokedAt: null };
      store.set(data.keyPrefix, row);
      return { id: row.id, keyPrefix: row.keyPrefix };
    }),
    findUnique: vi.fn(async ({ where }: { where: { keyPrefix: string } }) => {
      const r = store.get(where.keyPrefix);
      return r ? { ...r } : null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<KeyRow> }) => {
      for (const r of store.values()) if (r.id === where.id) Object.assign(r, data);
      return {};
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; tenantId: string; revokedAt: null }; data: Partial<KeyRow> }) => {
      let count = 0;
      for (const r of store.values()) {
        if (r.id === where.id && r.tenantId === where.tenantId && r.revokedAt === null) {
          Object.assign(r, data);
          count++;
        }
      }
      return { count };
    }),
    findMany: vi.fn(async () => [...store.values()]),
  },
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
  withTenant: (_t: string, fn: (t: typeof tx) => unknown) => fn(tx),
}));

import {
  issuePartnerApiKey,
  validatePartnerApiKey,
  revokePartnerApiKey,
} from "@/server/services/partner-api-key.service";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  store.clear();
  tenantState.clear();
  vi.clearAllMocks();
});

describe("partner-api-key service", () => {
  it("emite uma key e valida o segredo retornado", async () => {
    const issued = await issuePartnerApiKey({
      tenantId: TENANT,
      name: "ACME",
      scopes: ["depix:deposit", "depix:withdraw"],
      createdById: "u1",
    });
    // Formato at_<prefix>_<secret>.
    expect(issued.plaintextKey).toMatch(/^at_[A-Za-z0-9]{8}_/);
    expect(issued.plaintextKey).toContain(issued.keyPrefix);

    const v = await validatePartnerApiKey(issued.plaintextKey);
    expect(v).not.toBeNull();
    expect(v!.tenantId).toBe(TENANT);
    expect(v!.scopes).toEqual(["depix:deposit", "depix:withdraw"]);
  });

  it("rejeita segredo errado mesmo com prefixo certo", async () => {
    const issued = await issuePartnerApiKey({ tenantId: TENANT, name: "x", scopes: ["depix:deposit"], createdById: "u1" });
    const tampered = `at_${issued.keyPrefix}_segredoErrado_aaaaaaaaaaaaaaaaaaaa`;
    expect(await validatePartnerApiKey(tampered)).toBeNull();
  });

  it("rejeita formato invalido", async () => {
    expect(await validatePartnerApiKey("nope")).toBeNull();
    expect(await validatePartnerApiKey("Bearer at_x")).toBeNull();
    expect(await validatePartnerApiKey("")).toBeNull();
  });

  it("rejeita key revogada", async () => {
    const issued = await issuePartnerApiKey({ tenantId: TENANT, name: "x", scopes: ["depix:deposit"], createdById: "u1" });
    await revokePartnerApiKey({ tenantId: TENANT, keyId: issued.id });
    expect(await validatePartnerApiKey(issued.plaintextKey)).toBeNull();
  });

  it("revogar de OUTRO tenant nao afeta (isolamento)", async () => {
    const issued = await issuePartnerApiKey({ tenantId: TENANT, name: "x", scopes: ["depix:deposit"], createdById: "u1" });
    await revokePartnerApiKey({ tenantId: OTHER, keyId: issued.id }); // tenant errado
    // Continua valida (a updateMany filtra por tenantId).
    expect(await validatePartnerApiKey(issued.plaintextKey)).not.toBeNull();
  });

  it("descarta escopos invalidos na emissao", async () => {
    const issued = await issuePartnerApiKey({
      tenantId: TENANT,
      name: "x",
      scopes: ["depix:deposit", "admin:everything", "lixo"],
      createdById: "u1",
    });
    const v = await validatePartnerApiKey(issued.plaintextKey);
    expect(v!.scopes).toEqual(["depix:deposit"]);
  });

  // ADR 0061 revisou a auditoria de 2026-07-25 neste ponto: atraso de mensalidade
  // não desliga a integração do parceiro. Quem libera é o toggle do superadmin
  // (`apiAccessEnabled`), testado logo abaixo. `CANCELLED` segue recusado.
  it("tenant SUSPENDED (inadimplente) MANTÉM a key — quem corta é o toggle", async () => {
    const issued = await issuePartnerApiKey({ tenantId: TENANT, name: "x", scopes: ["depix:withdraw"], createdById: "u1" });
    expect(await validatePartnerApiKey(issued.plaintextKey)).not.toBeNull();
    tenantState.set(TENANT, { status: "SUSPENDED", apiAccessEnabled: true });
    expect(await validatePartnerApiKey(issued.plaintextKey)).not.toBeNull();
  });

  it("tenant CANCELLED invalida a key (saída, não atraso)", async () => {
    const issued = await issuePartnerApiKey({ tenantId: TENANT, name: "x", scopes: ["depix:withdraw"], createdById: "u1" });
    tenantState.set(TENANT, { status: "CANCELLED", apiAccessEnabled: true });
    expect(await validatePartnerApiKey(issued.plaintextKey)).toBeNull();
  });

  it("tenant SUSPENDED com o toggle desligado invalida a key", async () => {
    const issued = await issuePartnerApiKey({ tenantId: TENANT, name: "x", scopes: ["depix:withdraw"], createdById: "u1" });
    tenantState.set(TENANT, { status: "SUSPENDED", apiAccessEnabled: false });
    expect(await validatePartnerApiKey(issued.plaintextKey)).toBeNull();
  });

  it("apiAccessEnabled=false invalida a key mesmo com tenant ACTIVE", async () => {
    const issued = await issuePartnerApiKey({ tenantId: TENANT, name: "x", scopes: ["depix:withdraw"], createdById: "u1" });
    tenantState.set(TENANT, { status: "ACTIVE", apiAccessEnabled: false });
    expect(await validatePartnerApiKey(issued.plaintextKey)).toBeNull();
  });
});
