/**
 * Resolução da conta do dinheiro (ADR 0069).
 *
 * A ordem importa e é a razão de existir do serviço: input explícito → conta da
 * FORMA → conta padrão do tenant → null. Cada degrau abaixo é um teste, e o
 * último invariante ("nunca inventa conta") é o que protege a conciliação.
 */
import { describe, it, expect } from "vitest";
import { resolveReceivingAccountId } from "@/server/services/receiving-account-resolver.service";

const TENANT = "11111111-1111-1111-1111-111111111111";

/**
 * Dublê do client com só o que o resolver toca. Modela o banco como duas
 * listas, então os filtros (`tenantId`, `active`) são exercidos de verdade em
 * vez de mockados por chamada.
 */
function makeTx(opts: {
  accounts?: Array<{ id: string; tenantId: string; active: boolean; isDefault: boolean }>;
  methods?: Array<{ id: string; tenantId: string; defaultReceivingAccountId: string | null }>;
}) {
  const accounts = opts.accounts ?? [];
  const methods = opts.methods ?? [];
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  return {
    receivingAccount: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = accounts.find((a) => matches(a as never, where));
        return found ? { id: found.id } : null;
      },
    },
    paymentMethod: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = methods.find((m) => matches(m as never, where));
        return found ? { defaultReceivingAccountId: found.defaultReceivingAccountId } : null;
      },
    },
  } as never;
}

const conta = (id: string, over: Partial<{ active: boolean; isDefault: boolean }> = {}) => ({
  id,
  tenantId: TENANT,
  active: over.active ?? true,
  isDefault: over.isDefault ?? false,
});

describe("resolução da conta do dinheiro (ADR 0069)", () => {
  it("a escolha explícita do operador vence a conta da forma e a do tenant", async () => {
    const tx = makeTx({
      accounts: [conta("escolhida"), conta("da-forma"), conta("padrao", { isDefault: true })],
      methods: [{ id: "pix", tenantId: TENANT, defaultReceivingAccountId: "da-forma" }],
    });
    const got = await resolveReceivingAccountId(tx, {
      tenantId: TENANT,
      explicitAccountId: "escolhida",
      paymentMethodId: "pix",
    });
    expect(got).toBe("escolhida");
  });

  it("sem escolha explícita, usa a conta padrão da FORMA de pagamento", async () => {
    const tx = makeTx({
      accounts: [conta("nubank"), conta("padrao", { isDefault: true })],
      methods: [{ id: "pix-nubank", tenantId: TENANT, defaultReceivingAccountId: "nubank" }],
    });
    const got = await resolveReceivingAccountId(tx, {
      tenantId: TENANT,
      paymentMethodId: "pix-nubank",
    });
    expect(got).toBe("nubank");
  });

  it("cai para a conta padrão do tenant quando a forma não tem conta", async () => {
    const tx = makeTx({
      accounts: [conta("padrao", { isDefault: true })],
      methods: [{ id: "dinheiro", tenantId: TENANT, defaultReceivingAccountId: null }],
    });
    const got = await resolveReceivingAccountId(tx, {
      tenantId: TENANT,
      paymentMethodId: "dinheiro",
    });
    expect(got).toBe("padrao");
  });

  it("ignora a conta da forma quando ela foi DESATIVADA e cai para a do tenant", async () => {
    // Conta pode ser desativada depois de virar padrão de uma forma. Apontar
    // para conta morta seria pior que cair no fallback.
    const tx = makeTx({
      accounts: [conta("morta", { active: false }), conta("padrao", { isDefault: true })],
      methods: [{ id: "pix", tenantId: TENANT, defaultReceivingAccountId: "morta" }],
    });
    const got = await resolveReceivingAccountId(tx, {
      tenantId: TENANT,
      paymentMethodId: "pix",
    });
    expect(got).toBe("padrao");
  });

  it("sem conta padrão, usa QUALQUER conta ativa do tenant", async () => {
    // Último degrau, adicionado quando a conta virou obrigatória (ADR 0069
    // fase 2). Só acontece se o admin desmarcou o padrão sem marcar outro: o
    // dado segue honesto (é uma conta real do tenant) e a venda não trava por
    // um detalhe de configuração.
    const tx = makeTx({ accounts: [conta("alguma")], methods: [] });
    const got = await resolveReceivingAccountId(tx, { tenantId: TENANT });
    expect(got).toBe("alguma");
  });

  it("devolve null só quando o tenant não tem NENHUMA conta ativa", async () => {
    // Não deveria acontecer: a migration criou "Caixa da Loja" para todos e
    // `tenantFinancialInit` cria para os novos. Quem chama pelo
    // `requireReceivingAccountId` transforma isto em erro alto, com instrução
    // — melhor travar que gravar dinheiro sem origem.
    const tx = makeTx({ accounts: [conta("morta", { active: false })], methods: [] });
    const got = await resolveReceivingAccountId(tx, { tenantId: TENANT });
    expect(got).toBeNull();
  });

  it("não aceita conta de OUTRO tenant, mesmo escolhida explicitamente", async () => {
    const tx = makeTx({
      accounts: [{ id: "alheia", tenantId: "outro-tenant", active: true, isDefault: false }],
    });
    const got = await resolveReceivingAccountId(tx, {
      tenantId: TENANT,
      explicitAccountId: "alheia",
    });
    expect(got).toBeNull();
  });

  it("conta padrão do tenant DESATIVADA não é usada", async () => {
    const tx = makeTx({
      accounts: [conta("padrao-morta", { isDefault: true, active: false })],
    });
    const got = await resolveReceivingAccountId(tx, { tenantId: TENANT });
    expect(got).toBeNull();
  });

  it("id explícito inexistente cai para os degraus seguintes em vez de estourar", async () => {
    const tx = makeTx({ accounts: [conta("padrao", { isDefault: true })] });
    const got = await resolveReceivingAccountId(tx, {
      tenantId: TENANT,
      explicitAccountId: "nao-existe",
    });
    expect(got).toBe("padrao");
  });
});
