/**
 * E8-1 (Etapa 8, Módulo 1 — DePix): `depixTransaction.cancel` era
 * `tenantProcedure` e fazia `update` cru.
 *
 * **Dois defeitos no mesmo ponto**, ambos provados:
 *
 * 1. **RBAC assimétrico.** Criar saque é `tenantAdminProcedure` + step-up 2FA.
 *    Cancelar era operador comum. Provado no navegador contra a cópia de
 *    produção: um operador cancelou um WITHDRAW de R$ 50 com **HTTP 200**.
 *    (O isolamento entre tenants estava intacto — operador de outro tenant
 *    recebeu 404 pelo RLS, verificado no mesmo teste.)
 *
 * 2. **Sem CAS.** `findUnique` → checa `PENDING` → `update` cru. Entre a
 *    leitura e a escrita, o webhook da Eulen ou o reconciliador podem mover a
 *    transação para PROCESSING/COMPLETED; o `update` sobrescreveria o avanço e
 *    marcaria como cancelada uma transação **cujo dinheiro já saiu** —
 *    irreversível em cripto.
 *
 * O `depix-transaction.service.ts` já usava CAS em todos os pontos equivalentes
 * (752, 859, 1002, 1272). Só o router ficou de fora: a regra existia e foi
 * esquecida no irmão — o padrão que este programa de auditoria já nomeou dez
 * vezes.
 *
 * Impacto medido em produção: **zero ocorrências**. As 2 transações CANCELLED
 * foram canceladas pelo próprio serviço (timeout do LWK e L-BTC insuficiente),
 * não pela corrida. Correção preventiva de dinheiro irreversível.
 *
 * A lista de mutations é **derivada do código**, não escrita à mão — foi assim
 * que o teste de paridade de locks do M7 deixou `stock.ts` de fora e passou
 * cego.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/depix-transaction.ts"),
  "utf8",
);

/** Recorta o corpo de uma procedure pelo nome (evita casar com a irmã ao lado). */
function corpoDaProcedure(nome: string): string {
  const i = ROUTER.search(new RegExp(`^ {2}${nome}: (?:tenant|tenantAdmin|admin)Procedure`, "m"));
  if (i < 0) throw new Error(`procedure ${nome} não encontrada`);
  const resto = ROUTER.slice(i + 10);
  const prox = resto.search(/\n {2}\w+: (?:tenant|tenantAdmin|admin)Procedure/);
  return prox < 0 ? ROUTER.slice(i) : ROUTER.slice(i, i + 10 + prox);
}

/** Descobre no código quais mutations mudam o estado de uma transação DePix. */
function mutationsQueEscrevem(): string[] {
  const nomes: string[] = [];
  const re = /^ {2}(\w+): (?:tenant|tenantAdmin|admin)Procedure/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ROUTER)) !== null) {
    const corpo = corpoDaProcedure(m[1]!);
    if (/\.mutation\(/.test(corpo) && /tenantDepixTransaction\.(update|updateMany|create)/.test(corpo)) {
      nomes.push(m[1]!);
    }
  }
  return nomes;
}

describe("E8-1 — quem move dinheiro DePix exige admin", () => {
  const MUTATIONS = mutationsQueEscrevem();

  it("encontra as mutations no código (lista não escrita à mão)", () => {
    expect(MUTATIONS.length).toBeGreaterThan(0);
  });

  for (const nome of MUTATIONS) {
    it(`${nome} é tenantAdminProcedure`, () => {
      expect(
        corpoDaProcedure(nome),
        `${nome} escreve numa transação DePix. Criar saque exige admin + 2FA; ` +
          `qualquer mutation que mexa no mesmo registro precisa do mesmo nível — ` +
          `senão o operador desfaz pela porta dos fundos o que não pode fazer pela frente.`,
      ).toMatch(new RegExp(`^ {2}${nome}: tenantAdminProcedure`, "m"));
    });
  }
});

describe("escrita de status usa CAS, não update cru", () => {
  it("cancel ancora o UPDATE no status PENDING", () => {
    const corpo = corpoDaProcedure("cancel");
    expect(
      corpo,
      "sem `updateMany` ancorado em `status: \"PENDING\"`, um webhook concorrente " +
        "que avance a transação é sobrescrito — e uma transação cujo dinheiro já " +
        "saiu fica marcada como cancelada.",
    ).toMatch(/updateMany\(\{\s*where: \{ id: input\.id, status: "PENDING" \}/);
  });

  it("cancel detecta a corrida em vez de seguir em silêncio", () => {
    const corpo = corpoDaProcedure("cancel");
    expect(corpo).toMatch(/cas\.count !== 1/);
    expect(corpo).toMatch(/CONFLICT/);
  });
});
