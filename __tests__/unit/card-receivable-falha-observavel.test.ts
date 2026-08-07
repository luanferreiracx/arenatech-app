/**
 * E8-2 (Etapa 8, Módulo 2 — Recebíveis de cartão): `generateCardReceivables`
 * tinha dois `return 0` **mudos**.
 *
 * O fallback em si é decisão de projeto e está certo: sem adquirente ou sem
 * taxa cadastrada, a venda **não é bloqueada**. O problema é o silêncio — o
 * chamador (`sale.ts:1874`) descarta o retorno, e nada em log, métrica ou tela
 * registra que aquela venda no cartão ficou **sem recebível**.
 *
 * Consequência: dinheiro que a loja tem a receber simplesmente não existe no
 * sistema, e ninguém descobre até conferir o extrato da adquirente.
 *
 * ## O que a medição mostrou
 *
 * | período | vendas no cartão | sem recebível |
 * |---|---|---|
 * | mai/26 | 21 | 21 |
 * | jun/26 | 134 | 134 |
 * | jul/26 | 196 | 49 |
 * | ago/26 | 32 | **0** |
 *
 * O corte é limpo em **08→09/07** (deploy do writer): antes, nenhuma venda
 * gerava recebível; depois, todas. **179 vendas pós-writer, zero lacunas** — o
 * caminho funciona hoje. As 204 antigas (R$ 124.039) são o passivo já
 * conhecido, não regressão.
 *
 * ## Por que ainda importa
 *
 * O gatilho está armado: o adquirente `stone` do tenant `pdv-09ed1f82` está
 * **ATIVO com ZERO taxas cadastradas**. A primeira venda no cartão dele cai no
 * `if (!rate) return 0` e some sem deixar rastro.
 *
 * As defesas que já existiam (e continuam):
 * - a tela de configuração avisa "Sem taxas cadastradas" quando `rateCount === 0`;
 * - o PDV só oferece bandeiras/parcelas que têm taxa (`availableBrands`,
 *   `availableInstallments`).
 *
 * Nenhuma delas cobre o instante da falha. É defesa em profundidade: prevenir
 * na configuração **e** gritar quando escapar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WRITER = readFileSync(
  join(process.cwd(), "src/server/services/card-receivable-writer.service.ts"),
  "utf8",
);

/** Cada `return 0` do writer é uma venda no cartão que ficou sem recebível. */
function saidasSilenciosas(): number[] {
  const linhas = WRITER.split("\n");
  const mudas: number[] = [];

  linhas.forEach((linha, i) => {
    // `return 0;` isolado OU inline (`if (!rate) return 0;`) — a forma inline
    // era exatamente a do código defeituoso, e a primeira versão deste teste
    // não a reconhecia: passou verde contra o bug que existe para pegar.
    if (!/\breturn 0;/.test(linha)) return;
    // Um `return 0` é observável se houver `logger.` nas ~14 linhas anteriores
    // (dentro do mesmo bloco de guarda).
    const janela = linhas.slice(Math.max(0, i - 14), i).join("\n");
    if (!/logger\.(error|warn)\(/.test(janela)) mudas.push(i + 1);
  });

  return mudas;
}

describe("E8-2 — venda no cartão sem recebível não passa em silêncio", () => {
  it("todo `return 0` do writer registra o motivo", () => {
    const mudas = saidasSilenciosas();
    expect(
      mudas,
      `linhas ${mudas.join(", ")} devolvem 0 sem logar. O chamador descarta o ` +
        `retorno, então este log é a ÚNICA evidência de que a venda no cartão ` +
        `ficou sem recebível — dinheiro a receber que some do sistema.`,
    ).toEqual([]);
  });

  it("o log carrega o contexto necessário para achar a venda", () => {
    // Sem saleId/tenantId o alerta é inútil: sabe-se que falhou, não em quê.
    const blocos = WRITER.split("return 0;");
    for (const bloco of blocos.slice(0, -1)) {
      const trecho = bloco.slice(-700);
      expect(trecho).toMatch(/tenantId/);
      expect(trecho).toMatch(/saleId/);
      expect(trecho).toMatch(/grossCents/);
    }
  });

  it("usa nível `error`: é dinheiro a receber, não aviso de rotina", () => {
    expect(WRITER).toMatch(/logger\.error\([\s\S]{0,80}sem recebivel/);
  });
});

describe("o fallback continua sendo não-bloqueante (decisão de projeto)", () => {
  it("o writer devolve 0 em vez de lançar", () => {
    expect(
      WRITER,
      "lançar aqui bloquearia a finalização da venda por causa de configuração " +
        "ausente — pior que não gerar o recebível. O contrato é: não bloqueia, " +
        "mas avisa.",
    ).not.toMatch(/if \(!rate\) \{[\s\S]{0,400}throw /);
  });
});
