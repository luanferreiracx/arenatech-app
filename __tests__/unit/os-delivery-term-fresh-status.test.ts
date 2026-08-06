/**
 * Etapa 7, Módulo 1 (M1-1): `checkDeliveryTermStatus` decidia se podia entregar
 * a partir de um status lido ANTES da chamada HTTP à Autentique.
 *
 * A janela não é de milissegundos — é a duração de uma requisição de rede. Se a
 * OS for estornada nesse intervalo, `refund` marca REFUNDED e este caminho grava
 * DELIVERED por cima, com `update()` cru e sem checar nada. Resultado: OS
 * entregue com `refundedAt` preenchido — dinheiro devolvido e aparelho marcado
 * como entregue.
 *
 * O irmão `checkReturnTermStatus` (170 linhas abaixo) já re-lê o status dentro
 * da transação, com o comentário explicando exatamente por quê. Este não
 * recebeu a mesma correção — a correção fechou a instância, não a classe.
 *
 * O teste afirma a REGRA: a decisão de entregar sai do status FRESCO, não do
 * que foi lido antes do HTTP.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/service-order.ts"),
  "utf8",
);

/** Corpo do procedure, do nome até o fechamento aproximado. */
function corpoDoProcedure(nome: string): string {
  const ini = ROUTER.indexOf(`  ${nome}: tenantProcedure`);
  if (ini === -1) return "";
  return ROUTER.slice(ini, ini + 4000);
}

describe("M1-1 — termo de entrega decide com status fresco", () => {
  it("checkDeliveryTermStatus re-lê o status dentro da transação", () => {
    const corpo = corpoDoProcedure("checkDeliveryTermStatus");
    expect(corpo, "procedure não encontrado").not.toBe("");

    // A marca do padrão correto: buscar a OS de novo DENTRO do withTenant.
    expect(
      corpo,
      "decide a partir de `prep.order.status`, lido antes da chamada HTTP — " +
        "uma OS estornada nesse intervalo é sobrescrita para DELIVERED",
    ).toMatch(/withTenant[\s\S]*?findUnique|withTenant[\s\S]*?findFirst/);
  });

  it("a decisão de entregar NÃO usa prep.order.status", () => {
    const corpo = corpoDoProcedure("checkDeliveryTermStatus");
    // `canDeliver` derivado de `prep.order.status` é exatamente o defeito.
    expect(
      /canDeliver\s*=\s*\[[^\]]*\]\.includes\(prep\.order\.status\)/.test(corpo),
      "canDeliver sai de prep.order.status (obsoleto após o HTTP)",
    ).toBe(false);
  });

  it("o irmão checkReturnTermStatus continua com o padrão (controle)", () => {
    const corpo = corpoDoProcedure("checkReturnTermStatus");
    expect(corpo).toMatch(/withTenant[\s\S]*?findUnique/);
  });
});
