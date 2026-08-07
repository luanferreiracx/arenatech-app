/**
 * E8-8 (Etapa 8, Módulo 7 — Vendas avulsas): `markPaid` declara **dinheiro
 * recebido** e não deixava rastro nenhum — nem `logAudit`, nem `logger`.
 *
 * ## O que medi
 *
 * Provado no navegador contra a cópia de produção: um **operador** marcou uma
 * venda avulsa real como PAGA (HTTP 200), sem admin e sem 2FA.
 *
 * Isso **não é** o defeito. Registrar recebimento é atendimento, não gestão — a
 * mesma lógica do PDV, que restringe o **estorno** (`sale.refund` é admin-only)
 * e não a venda. Bloquear aqui quebraria o balcão.
 *
 * O defeito é o **silêncio**. Em 18 das 21 vendas de produção há lastro externo
 * (DePix/wallet) e o `markPaid` revalida na fonte — o operador não consegue
 * mentir. Nas **3 sem lastro**, a palavra dele é a única prova, e não havia
 * como reconstruir quem declarou o quê.
 *
 * ## A corrida, e por que ela é P3
 *
 * O webhook do PagBank (`webhooks/pagbank/route.ts:108`) escreve a **mesma**
 * transição, com o mesmo padrão ler-checar-escrever. Ambos ganharam CAS.
 *
 * Mas a consequência é pequena, e vale registrar por honestidade: **nenhum dos
 * dois gera efeito colateral financeiro** (não escreve caixa, recebível nem
 * FT), e `quick_sales.paid_at` **não alimenta DRE nem fluxo de caixa**.
 * Escrever `PAID` duas vezes não duplica dinheiro — só sobrescreveria o
 * `paidAt`. Corrigi porque é barato e o padrão é conhecido, não porque estava
 * sangrando.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/quick-sale.ts"),
  "utf8",
);
const WEBHOOK = readFileSync(
  join(process.cwd(), "src/app/api/webhooks/pagbank/route.ts"),
  "utf8",
);

function corpoDaProcedure(nome: string): string {
  const i = ROUTER.search(new RegExp(`^ {2}${nome}: \\w+Procedure`, "m"));
  if (i < 0) throw new Error(`procedure ${nome} não encontrada`);
  const resto = ROUTER.slice(i + 10);
  const prox = resto.search(/\n {2}\w+: (?:tenant|tenantAdmin|admin|public)Procedure/);
  return prox < 0 ? ROUTER.slice(i) : ROUTER.slice(i, i + 10 + prox);
}

describe("E8-8 — declarar pagamento recebido deixa rastro", () => {
  const corpo = corpoDaProcedure("markPaid");

  it("grava trilha de auditoria", () => {
    expect(
      corpo,
      "`markPaid` declara dinheiro recebido e é acessível ao operador. Nas " +
        "vendas sem lastro externo (3 de 21 em produção) a palavra dele é a " +
        "única prova — sem trilha, ninguém reconstrói quem declarou o quê.",
    ).toMatch(/logAudit\(/);
  });

  it("a trilha diz se houve revalidação na fonte", () => {
    // É o campo que separa "o DePix confirmou" de "o operador afirmou".
    expect(corpo).toMatch(/revalidadoNaFonte/);
  });

  it("a trilha identifica a venda e o valor", () => {
    expect(corpo).toMatch(/number: existing\.number/);
    expect(corpo).toMatch(/totalAmount/);
  });
});

describe("os dois caminhos que marcam PAID usam CAS", () => {
  it("markPaid ancora a transição no status", () => {
    expect(corpoDaProcedure("markPaid")).toMatch(
      /updateMany\(\{\s*where: \{ id: input\.id, status: "AWAITING_PAYMENT" \}/,
    );
  });

  it("o webhook do PagBank ancora também", () => {
    expect(
      WEBHOOK,
      "o webhook escreve a MESMA transição que o `markPaid`. O check de " +
        "`status === PAID` acima dele é fast-path/UX, não garantia.",
    ).toMatch(/updateMany\(\{\s*where: \{ id: quickSale\.id, status: "AWAITING_PAYMENT" \}/);
  });
});

describe("o que NÃO deve mudar", () => {
  it("markPaid continua acessível ao operador", () => {
    // Registrar recebimento é atendimento. O PDV restringe o ESTORNO, não a
    // venda — a mesma regra vale aqui. Um gate de admin quebraria o balcão.
    expect(ROUTER).toMatch(/^ {2}markPaid: tenantProcedure/m);
  });

  it("a revalidação na fonte continua de pé", () => {
    const corpo = corpoDaProcedure("markPaid");
    expect(corpo).toMatch(/checkTransactionStatus\(/);
    expect(corpo).toMatch(/isSettledForSaleDepixStatus\(/);
    // e a transação DePix precisa pertencer a ESTA venda
    expect(corpo).toMatch(/sourceId !== existing\.id/);
  });
});
