/**
 * Etapa 7, Módulo 1 (M1-3) e Módulo 7 (M7-1): todo caminho que escreve na gaveta
 * precisa travar a sessão antes.
 *
 * O padrão e a razão estão escritos no `sale.ts`, no fix do B9:
 *
 *   "Entre o `findFirst` acima e o `writeCashMovement` abaixo há uma janela em
 *    que o fechamento pode commitar: o movimento entraria numa sessão já
 *    fechada e ficaria FORA da conferência — dinheiro que o relatório de
 *    fechamento não conta."
 *
 * E a nota do mesmo fix nomeia a classe: "é o mesmo padrão que a auditoria
 * encontrou seis vezes: a correção fecha a instância, não a classe."
 *
 * **Este teste já existiu e passou cego.** Escrito no M1, tinha dois furos que o
 * M7 encontrou:
 *
 * 1. `stock.ts` não estava na lista escrita à mão — e escreve 2× na gaveta
 *    (compra e cancelamento de compra de aparelho: R$ 409.280 em 73 movimentos).
 * 2. A asserção era `locks > 0`, que um único lock satisfaz. `sale.ts` tinha
 *    lock só no `finalize`: as duas escritas do `refund` passavam despercebidas.
 *
 * Ou seja: o próprio teste da paridade cometeu o erro que existe para pegar.
 *
 * A asserção agora é **posicional**, não uma contagem: para cada
 * `writeCashMovement`, procura um `lockOpenCashSessionOrThrow` antes dele dentro
 * da mesma função. Contagem 1:1 seria errada na direção oposta — um lock antes
 * de um laço protege legitimamente todas as escritas do laço.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * Descobre no código quem escreve na gaveta, em vez de manter lista à mão —
 * uma lista à mão é exatamente como `stock.ts` ficou de fora.
 */
function arquivosQueEscrevemNaGaveta(): string[] {
  const saida = execFileSync(
    "grep",
    ["-rl", "--include=*.ts", "writeCashMovement(", "src"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  return saida
    .split("\n")
    .filter(Boolean)
    // o serviço é quem DEFINE writeCashMovement e o lock; não é chamador
    .filter((f) => !f.endsWith("cash-session.service.ts"))
    .sort();
}

/**
 * Uma escrita está protegida se existe um lock antes dela **na mesma
 * procedure**. A fronteira de procedure é o que impede um lock do `finalize`
 * de "cobrir" uma escrita do `refund`, 700 linhas abaixo — que era exatamente
 * o furo do teste antigo.
 */
const INICIO_DE_PROCEDURE = /^\s{2}\w+: (?:tenant|admin|protected|public)Procedure/;

function escritasDesprotegidas(src: string): number[] {
  const linhas = src.split("\n");
  const desprotegidas: number[] = [];
  let lockVisto = false;
  let sessaoCriadaAqui = false;

  linhas.forEach((linha, i) => {
    if (INICIO_DE_PROCEDURE.test(linha)) {
      // nova procedure, novo escopo
      lockVisto = false;
      sessaoCriadaAqui = false;
    }
    if (linha.includes("lockOpenCashSessionOrThrow(")) lockVisto = true;
    // A ABERTURA de caixa cria a sessão na própria transação: ninguém mais
    // conhece o id, então não existe janela para o fechamento entrar. Travar
    // uma linha que acabou de ser inserida seria ruído, não defesa.
    if (linha.includes("tx.cashSession.create(")) sessaoCriadaAqui = true;
    if (linha.includes("writeCashMovement(") && !lockVisto && !sessaoCriadaAqui) {
      desprotegidas.push(i + 1);
    }
  });

  return desprotegidas;
}

describe("toda escrita na gaveta é precedida por lock da sessão", () => {
  const arquivos = arquivosQueEscrevemNaGaveta();

  it("encontra os chamadores no código (a lista não é escrita à mão)", () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  for (const rel of arquivos) {
    it(`${rel.split("/").pop()} trava a sessão antes de cada escrita`, () => {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      const linhas = escritasDesprotegidas(src);

      expect(
        linhas,
        `${rel}: writeCashMovement nas linhas ${linhas.join(", ")} sem ` +
          `lockOpenCashSessionOrThrow antes, na mesma procedure. O movimento pode ` +
          `cair numa sessão fechada entre o findFirst e a escrita — dinheiro fora ` +
          `da conferência do fechamento.`,
      ).toEqual([]);
    });
  }
});
