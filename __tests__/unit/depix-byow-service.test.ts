/**
 * depix-byow.service: allowlist de carteiras BYOW. Foco na BARREIRA de segurança
 * (`assertAddressAllowed` barra endereço fora da lista) e no add idempotente.
 * Prisma mockado via withTenant.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const findMany = vi.fn();

const tx = {
  tenantByowWallet: { findFirst, findUnique, create, update, updateMany, findMany },
};

vi.mock("@/server/db", () => ({
  withTenant: (_tenantId: string, fn: (t: typeof tx) => unknown) => fn(tx),
}));

import {
  assertAddressAllowed,
  addByowWallet,
  removeByowWallet,
} from "@/server/services/depix-byow.service";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ADDR = "lq1qqexternaldestaddr00000000000000000000";

beforeEach(() => {
  for (const m of [findFirst, findUnique, create, update, updateMany, findMany]) m.mockReset();
});

describe("assertAddressAllowed (barreira de segurança)", () => {
  it("passa quando o endereço está na allowlist ativa", async () => {
    findFirst.mockResolvedValue({ id: "w1" });
    await expect(assertAddressAllowed(TENANT, ADDR)).resolves.toBeUndefined();
    expect(findFirst.mock.calls[0]![0]).toMatchObject({
      where: { tenantId: TENANT, address: ADDR, active: true },
    });
  });

  it("BARRA (lança) quando o endereço NÃO está na allowlist", async () => {
    findFirst.mockResolvedValue(null);
    await expect(assertAddressAllowed(TENANT, ADDR)).rejects.toThrow(/carteiras autorizadas/i);
  });

  it("normaliza (trim) o endereço antes de checar", async () => {
    findFirst.mockResolvedValue({ id: "w1" });
    await assertAddressAllowed(TENANT, `  ${ADDR}  `);
    expect(findFirst.mock.calls[0]![0]).toMatchObject({ where: { address: ADDR } });
  });
});

describe("addByowWallet", () => {
  it("cria quando não existe", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({
      id: "w1", address: ADDR, label: "Principal", isThirdParty: false, active: true, createdAt: new Date(),
    });
    const res = await addByowWallet({
      tenantId: TENANT, createdByUserId: "u1", address: ADDR, label: "Principal", isThirdParty: false,
    });
    expect(create).toHaveBeenCalled();
    expect(res).toMatchObject({ id: "w1", address: ADDR, active: true });
  });

  it("reativa/atualiza (não duplica) quando já existe", async () => {
    findUnique.mockResolvedValue({ id: "w1", active: false });
    update.mockResolvedValue({
      id: "w1", address: ADDR, label: "Novo apelido", isThirdParty: true, active: true, createdAt: new Date(),
    });
    const res = await addByowWallet({
      tenantId: TENANT, createdByUserId: "u1", address: ADDR, label: "Novo apelido", isThirdParty: true,
    });
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.calls[0]![0]).toMatchObject({ data: { active: true, label: "Novo apelido" } });
    expect(res.active).toBe(true);
  });
});

describe("removeByowWallet", () => {
  it("desativa (soft) e não estoura quando havia 1", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await expect(removeByowWallet(TENANT, "w1")).resolves.toBeUndefined();
    expect(updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: "w1", tenantId: TENANT, active: true },
      data: { active: false },
    });
  });

  it("NOT_FOUND quando não afeta nenhuma linha", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(removeByowWallet(TENANT, "w1")).rejects.toThrow(/não encontrada/i);
  });
});
