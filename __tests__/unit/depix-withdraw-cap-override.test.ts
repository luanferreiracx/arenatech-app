/**
 * Teto de saque por 24h configurável pelo superadmin, POR TENANT.
 *
 * Antes os dois tetos eram constantes de ambiente: subir para um parceiro de
 * volume alto subiria para TODO MUNDO. Agora o default segue no ambiente e cada
 * tenant pode ter o seu.
 *
 * A regra do `null`/`0` é o ponto sutil: campo vazio significa "usa o default",
 * não "sem teto" e nem "teto zero". Zerar por engano num campo de texto travaria
 * todo saque do tenant — e "0" é ambíguo demais para significar bloqueio. Para
 * bloquear saque existe suspender o tenant.
 */
import { describe, it, expect } from "vitest";
import { resolveDailyCapCents } from "@/lib/depix/daily-cap";

const DEFAULT_CENTS = 2_500_000; // R$ 25.000

describe("resolveDailyCapCents", () => {
  it("sem override (null) usa o default do ambiente", () => {
    expect(resolveDailyCapCents(null, DEFAULT_CENTS)).toBe(DEFAULT_CENTS);
  });

  it("campo ausente (undefined) usa o default", () => {
    expect(resolveDailyCapCents(undefined, DEFAULT_CENTS)).toBe(DEFAULT_CENTS);
  });

  it("override do superadmin vence o default", () => {
    expect(resolveDailyCapCents(5_000_000, DEFAULT_CENTS)).toBe(5_000_000);
  });

  it("override MENOR que o default é respeitado (apertar o teto é caso de uso)", () => {
    // Um tenant sob suspeita pode ter o teto reduzido sem mexer em ninguém mais.
    expect(resolveDailyCapCents(50_000, DEFAULT_CENTS)).toBe(50_000);
  });

  it("zero cai no default em vez de travar todo saque do tenant", () => {
    expect(resolveDailyCapCents(0, DEFAULT_CENTS)).toBe(DEFAULT_CENTS);
  });

  it("negativo cai no default (não vira teto negativo)", () => {
    expect(resolveDailyCapCents(-1, DEFAULT_CENTS)).toBe(DEFAULT_CENTS);
  });
});

describe("validador do superadmin", () => {
  it("barra teto absurdo (dedo gordo em campo que governa saída de dinheiro)", async () => {
    const { updateTenantSchema } = await import("@/lib/validators/admin");
    const base = { id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", name: "T" };

    // R$ 10.000.000 passa; acima disso, não.
    expect(
      updateTenantSchema.safeParse({ ...base, partnerApiWithdrawDailyCapCents: 1_000_000_000 })
        .success,
    ).toBe(true);
    expect(
      updateTenantSchema.safeParse({ ...base, partnerApiWithdrawDailyCapCents: 1_000_000_001 })
        .success,
    ).toBe(false);
  });

  it("aceita null (limpar o campo = voltar ao default)", () => {
    // Import estático evitaria o await; aqui o schema já foi carregado acima.
    return import("@/lib/validators/admin").then(({ updateTenantSchema }) => {
      const r = updateTenantSchema.safeParse({
        id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        name: "T",
        depixWithdrawDailyCapCents: null,
      });
      expect(r.success).toBe(true);
    });
  });

  it("rejeita valor fracionado (centavos são inteiros)", async () => {
    const { updateTenantSchema } = await import("@/lib/validators/admin");
    const r = updateTenantSchema.safeParse({
      id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      name: "T",
      depixWithdrawDailyCapCents: 1000.5,
    });
    expect(r.success).toBe(false);
  });
});
