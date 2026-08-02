/**
 * Fila de saques que a API de parceiros deixa para um humano autorizar.
 *
 * Existe porque o saque da API exigia carteira custodial e, desde o ADR 0051,
 * nenhum cliente é custodial — o endpoint estava inalcançável por 100% dos
 * tenants reais. A saída não é dar a chave para a máquina: em carteira
 * non-custodial o servidor não assina sem a passphrase do titular, e é isso que
 * torna o modelo non-custodial.
 *
 * O que estes testes protegem é o risco novo que a fila cria: um pedido não pode
 * virar DOIS saques. Nem por duas abas autorizando junto, nem por uma tentativa
 * que falhou no meio e foi refeita.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const createWithdraw = vi.fn();

const tx = {
  depixWithdrawAuthorization: { findFirst, create, update, updateMany },
};

vi.mock("@/server/db", () => ({
  withTenant: (_tenantId: string, fn: (t: typeof tx) => unknown) => fn(tx),
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
}));
vi.mock("@/server/services/depix-transaction.service", () => ({
  createWithdraw: (...a: unknown[]) => createWithdraw(...a),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  requestWithdrawAuthorization,
  authorizeWithdrawRequest,
  rejectWithdrawRequest,
} from "@/server/services/depix-withdraw-authorization.service";

const TENANT = "11111111-1111-1111-1111-111111111111";
const AUTH_ID = "22222222-2222-2222-2222-222222222222";

const pedidoPendente = (over: Record<string, unknown> = {}) => ({
  id: AUTH_ID,
  tenantId: TENANT,
  status: "PENDING",
  pixKeyType: "CPF",
  pixKey: "12345678909",
  recipientName: null,
  recipientTaxId: "12345678909",
  netAmountCents: 5000,
  description: null,
  keyPrefix: "abcd1234",
  expiresAt: new Date(Date.now() + 60_000),
  ...over,
});

const pedido = {
  tenantId: TENANT,
  keyPrefix: "abcd1234",
  idempotencyKey: "idem-1",
  pixKeyType: "CPF" as const,
  pixKey: "12345678909",
  recipientTaxId: "12345678909",
  netAmountCents: 5000,
};

beforeEach(() => {
  for (const m of [findFirst, create, update, updateMany, createWithdraw]) m.mockReset();
});

describe("requestWithdrawAuthorization", () => {
  it("retry do parceiro cai no MESMO pedido, não enfileira dois", async () => {
    // Dois pedidos idênticos na fila é o que vira pagamento em dobro quando
    // alguém autoriza os dois sem perceber.
    findFirst.mockResolvedValue(pedidoPendente());
    const res = await requestWithdrawAuthorization(pedido);
    expect(res.id).toBe(AUTH_ID);
    expect(create).not.toHaveBeenCalled();
  });

  it("pedido novo nasce PENDING e com prazo de validade", async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
    const res = (await requestWithdrawAuthorization(pedido)) as unknown as {
      expiresAt: Date;
    };
    expect(create).toHaveBeenCalledOnce();
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("authorizeWithdrawRequest", () => {
  const autorizar = () =>
    authorizeWithdrawRequest({
      tenantId: TENANT,
      authorizationId: AUTH_ID,
      userId: "user-1",
      passphrase: "senha",
    });

  it("cria o saque com chave derivada do PEDIDO", async () => {
    // É essa chave que torna seguro devolver o pedido para a fila quando algo
    // falha: numa segunda tentativa o createWithdraw reconhece a mesma chave e
    // devolve o saque que já existe, em vez de criar um segundo.
    findFirst.mockResolvedValue(pedidoPendente());
    updateMany.mockResolvedValue({ count: 1 });
    createWithdraw.mockResolvedValue({ id: "tx-1" });
    update.mockResolvedValue({});

    await autorizar();

    expect(createWithdraw.mock.calls[0]![0]).toMatchObject({
      idempotencyKey: `auth:${AUTH_ID}`,
      passphrase: "senha",
      netAmountCents: 5000,
    });
  });

  it("duas autorizações simultâneas produzem UM saque", async () => {
    // Quem perde o CAS não chega a chamar o createWithdraw.
    findFirst.mockResolvedValue(pedidoPendente());
    updateMany.mockResolvedValue({ count: 0 });

    await expect(autorizar()).rejects.toThrow(TRPCError);
    expect(createWithdraw).not.toHaveBeenCalled();
  });

  it("falha no saque devolve o pedido para a fila", async () => {
    // Senha errada, saldo insuficiente, cache a reparar: o humano precisa poder
    // corrigir e tentar de novo, e não ficar com um pedido morto.
    findFirst.mockResolvedValue(pedidoPendente());
    updateMany.mockResolvedValue({ count: 1 });
    createWithdraw.mockRejectedValue(new Error("senha da carteira invalida"));

    await expect(autorizar()).rejects.toThrow(/senha da carteira/i);

    const reverteu = updateMany.mock.calls.some(
      ([args]) => (args as { data?: { status?: string } }).data?.status === "PENDING",
    );
    expect(reverteu).toBe(true);
  });

  it("pedido já decidido não autoriza de novo", async () => {
    findFirst.mockResolvedValue(pedidoPendente({ status: "AUTHORIZED" }));
    await expect(autorizar()).rejects.toThrow(/já foi autorizado/i);
    expect(createWithdraw).not.toHaveBeenCalled();
  });

  it("pedido vencido não autoriza", async () => {
    // Quem autoriza dois dias depois já não lembra do contexto que gerou o
    // pedido — aprovar no automático é o risco.
    findFirst.mockResolvedValue(pedidoPendente({ expiresAt: new Date(Date.now() - 1) }));
    await expect(autorizar()).rejects.toThrow(/venceu/i);
    expect(createWithdraw).not.toHaveBeenCalled();
  });

  it("pedido inexistente não vira saque", async () => {
    findFirst.mockResolvedValue(null);
    await expect(autorizar()).rejects.toThrow(TRPCError);
    expect(createWithdraw).not.toHaveBeenCalled();
  });
});

describe("rejectWithdrawRequest", () => {
  it("recusa um pedido pendente", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await expect(
      rejectWithdrawRequest({ tenantId: TENANT, authorizationId: AUTH_ID, userId: "user-1" }),
    ).resolves.toBeUndefined();
  });

  it("não recusa o que já foi decidido", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      rejectWithdrawRequest({ tenantId: TENANT, authorizationId: AUTH_ID, userId: "user-1" }),
    ).rejects.toThrow(/já foi decidido/i);
  });
});
