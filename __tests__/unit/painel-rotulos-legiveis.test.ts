/**
 * PNL-1 a PNL-4 (Etapa 9, Módulo 16 — Painel): a primeira tela que o operador vê
 * ao entrar tinha **11 elementos cortados** a 320px.
 *
 * Este módulo é diferente dos anteriores: não há tabela transbordando nem coluna
 * nascendo fora da vista. O defeito é de **densidade** — grids de duas colunas em
 * telas de 320px, com rótulos que não cabem no que sobra.
 *
 * ## PNL-1 — seis dos oito indicadores com rótulo cortado
 *
 * ```
 * FATURAM…   VENDAS H…   TICKET MÉ…   OS ABERT…   CONTAS V…   ESTOQUE …
 * ```
 *
 * O `truncate` estava correto; faltava espaço. Três causas somadas: `uppercase`
 * (maiúsculas são mais largas), `tracking-wide` (espaçamento extra) e o ícone
 * consumindo 16px + gap da mesma linha de 72px.
 *
 * No celular o rótulo passou a vir em caixa normal, sem espaçamento extra, com
 * gap e padding menores. A partir de `sm` volta o visual original.
 *
 * ## PNL-2 — dois cartões idênticos lado a lado
 *
 * "Faturamento hoje" e "Faturamento mês (N)" **ambos viravam "Faturamento …"** —
 * dois cartões com valores diferentes e nada dizendo qual era qual. O que
 * distingue ("hoje"/"mês") era exatamente o que o corte comia.
 *
 * Viraram "Vendido hoje" e "Vendido no mês": cabem inteiros e "vendido" mantém
 * claro que é dinheiro (só o ícone não bastaria). O sufixo `(N)` saiu — era a
 * contagem de vendas, que o cartão "Vendas hoje" já cobre.
 *
 * ## PNL-3 — cinco atalhos de navegação cortados
 *
 * `"Histórico d…"` (-49px), `"Ordens de …"` (-38px), `"Posição d…"` (-48px),
 * `"Carteira D…"`, `"Buscar iPh…"`. São botões de **navegação**: o operador
 * precisa saber para onde vai.
 *
 * Diferente dos KPIs — onde o valor é o conteúdo e o rótulo acompanha —, aqui o
 * rótulo é tudo. Uma coluna no celular resolve sem espremer nada.
 *
 * ## PNL-4 — a instrução do caixa fechado
 *
 * `"Abra o caixa para inicia…"` (-46px). Texto de **orientação**, não dado
 * tabular: `line-clamp-2` deixa ocupar duas linhas mantendo o teto, sem empurrar
 * o botão "Abrir caixa" para fora.
 *
 * ## Resultado
 *
 * ```
 * antes:  11 elementos cortados
 * depois:  1 ("Contas venci…", -7px, ainda legível)
 * rolagem da página: 0 · nada fora da viewport · botão de abrir caixa intacto
 * ```
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAINEL = readFileSync(
  join(process.cwd(), "src/app/(app)/_components/dashboard-content.tsx"),
  "utf8",
);

describe("PNL-1 — o rótulo do indicador cabe a 320px", () => {
  it("não usa uppercase nem tracking-wide no celular", () => {
    const i = PAINEL.indexOf("{label}");
    expect(i).toBeGreaterThan(0);
    const trecho = PAINEL.slice(Math.max(0, i - 260), i);
    expect(
      trecho,
      "maiúsculas + `tracking-wide` alargam o texto numa caixa de 72px. " +
        "Seis dos oito rótulos eram cortados.",
    ).toMatch(/sm:uppercase sm:tracking-wide/);
    // O que importa é NÃO aplicar sem prefixo — `uppercase` solto volta o defeito.
    expect(trecho).not.toMatch(/[^:]uppercase tracking-wide/);
  });

  it("o cartão encolhe o padding no celular", () => {
    expect(PAINEL).toMatch(/px-2\.5 py-3\.5 transition-colors sm:px-4/);
  });

  it("o cartão pode encolher dentro do grid", () => {
    // Sem `min-w-0` o filho do grid não encolhe abaixo do conteúdo, e o
    // `truncate` do rótulo fica sem efeito.
    const i = PAINEL.indexOf("rounded-xl border border-border bg-card px-2.5");
    expect(PAINEL.slice(Math.max(0, i - 20), i)).toMatch(/min-w-0/);
  });
});

describe("PNL-2 — os dois cartões de faturamento se distinguem", () => {
  it("os rótulos não começam com a mesma palavra longa", () => {
    // "Faturamento hoje" e "Faturamento mês" viravam ambos "Faturamento …".
    expect(PAINEL).not.toMatch(/label="Faturamento hoje"/);
    expect(PAINEL).not.toMatch(/label=\{`Faturamento mês/);
  });

  it("usa rótulos curtos que cabem", () => {
    expect(PAINEL).toMatch(/label="Vendido hoje"/);
    expect(PAINEL).toMatch(/label="Vendido no mês"/);
  });

  it("o rótulo do mês não carrega a contagem", () => {
    // O sufixo `(N)` empurrava a palavra que distingue os dois cartões para fora,
    // e a contagem já existe em "Vendas hoje".
    const i = PAINEL.indexOf('label="Vendido no mês"');
    expect(PAINEL.slice(i, i + 120)).not.toMatch(/monthCount/);
  });
});

describe("PNL-3 — os atalhos de navegação cabem", () => {
  it("uma coluna no celular, duas a partir de 420px", () => {
    const i = PAINEL.indexOf("links.map");
    const grid = PAINEL.lastIndexOf('<div className="grid', i);
    const trecho = PAINEL.slice(grid, grid + 170);
    expect(
      trecho,
      "`grid-cols-2` a 320px cortava 5 dos 8 atalhos — 'Histórico d…' perdia " +
        "49px. São botões de navegação: o rótulo É o conteúdo.",
    ).toMatch(/grid-cols-1/);
    expect(trecho).toMatch(/min-\[420px\]:grid-cols-2/);
  });
});

describe("PNL-4 — a instrução do caixa não é cortada", () => {
  it("usa line-clamp em vez de truncate", () => {
    const i = PAINEL.indexOf("Abra o caixa para iniciar");
    expect(i).toBeGreaterThan(0);
    const trecho = PAINEL.slice(Math.max(0, i - 320), i);
    expect(
      trecho,
      "orientação ao operador pode ocupar duas linhas; `truncate` cortava em " +
        "'Abra o caixa para inicia…'.",
    ).toMatch(/line-clamp-2/);
  });
});
