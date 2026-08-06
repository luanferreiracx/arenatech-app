/**
 * Etapa 7, Módulo 4 (M4-1): opt-out de LGPD inalcançável para lead sem Customer.
 *
 * O gate do disparo em massa (`interest.ts:340-385`) já era bom: casa o opt-out
 * por `customerId` **ou** por telefone, justamente porque "o opt-out é da PESSOA,
 * não do registro" (comentário do CL-2).
 *
 * O que faltava era a porta de ENTRADA. `unsubscribeCustomer`
 * (`communication.ts:532`) exige `customerId: uuid` — e **114 dos 119 leads em
 * produção não têm Customer**. Se um deles responde "PARE" no WhatsApp, o
 * operador não tem onde registrar: teria que criar um Customer fictício só para
 * marcá-lo, ou apagar o lead (hard delete, admin-only).
 *
 * Ou seja: a defesa contra furar o descadastro existia, e a maneira de se
 * descadastrar não. Este teste afirma que a pessoa sem cadastro consegue sair.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();

vi.mock("@/server/db", () => ({
  withTenant: (_t: string, fn: (tx: unknown) => unknown) =>
    fn({ interest: { findUnique, update } }),
}));

import { unsubscribeInterest } from "@/server/services/interest-optout.service";

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  update.mockResolvedValue({});
});

describe("M4-1 — opt-out de lead sem Customer", () => {
  it("marca o lead como descadastrado mesmo sem customerId", async () => {
    findUnique.mockResolvedValue({ id: "lead-1", tenantId: "t1", customerId: null, unsubscribed: false });

    await unsubscribeInterest({ tenantId: "t1", interestId: "lead-1", userId: "u1" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead-1" },
        data: expect.objectContaining({ unsubscribed: true }),
      }),
    );
  });

  it("carimba quando o pedido foi feito (prova de atendimento à LGPD)", async () => {
    findUnique.mockResolvedValue({ id: "lead-2", tenantId: "t1", customerId: null, unsubscribed: false });

    await unsubscribeInterest({ tenantId: "t1", interestId: "lead-2", userId: "u1" });

    const data = update.mock.calls[0]![0].data;
    expect(data.unsubscribedAt).toBeInstanceOf(Date);
  });

  it("é idempotente — pedir duas vezes não muda a data do primeiro pedido", async () => {
    findUnique.mockResolvedValue({
      id: "lead-3",
      tenantId: "t1",
      customerId: null,
      unsubscribed: true,
    });

    await unsubscribeInterest({ tenantId: "t1", interestId: "lead-3", userId: "u1" });

    expect(update, "já descadastrado: nada a fazer").not.toHaveBeenCalled();
  });

  it("lead de outro tenant não é alcançável", async () => {
    findUnique.mockResolvedValue(null); // RLS já filtrou

    await expect(
      unsubscribeInterest({ tenantId: "t1", interestId: "lead-de-outro", userId: "u1" }),
    ).rejects.toThrow(/nao encontrado|not found/i);
  });
});
