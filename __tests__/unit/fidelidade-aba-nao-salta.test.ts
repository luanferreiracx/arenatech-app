/**
 * FDU-3 (Etapa 9, Módulo 9 — Fidelidade): criar a PRIMEIRA campanha jogava o
 * operador de volta para a aba "Submissões".
 *
 * ## O defeito
 *
 * O FDU-2 resolveu o problema certo — sem campanha, abrir em "Campanhas" em vez
 * de mandar a loja esperar submissões que nunca virão — mas com um estado que se
 * **movia**:
 *
 * ```ts
 * const tab = tabEscolhida ?? (semCampanha ? "campanhas" : "submissoes");
 * ```
 *
 * `tabEscolhida` só deixa de ser `null` quando alguém CLICA numa aba. Até lá o
 * valor é derivado de `semCampanha`, que muda sozinho no instante em que a
 * primeira campanha nasce. A aba saltava debaixo do operador.
 *
 * ## Medido no navegador (módulo com 0 campanhas, como está em produção)
 *
 * ```
 * criar a 1ª campanha -> aba salta para "Submissões", lista vazia:
 *                        "quando um cliente publicar, a submissão aparece aqui"
 *                        (a campanha recém-criada em lugar nenhum)
 * criar a 2ª campanha -> aba PERMANECE em "Campanhas"
 * ```
 *
 * A segunda medição isola a causa: com `tabEscolhida` já preenchido o salto
 * some. O defeito existe **só no primeiro contato da loja com o módulo** — quem
 * menos tem repertório para entender que o salvamento funcionou.
 *
 * Em produção a fidelidade tem **0 campanhas, 0 submissões, 0 saldos e 0
 * movimentos**, um mês depois de construída (#685-#690). Toda loja que abrir a
 * tela pela primeira vez passa por este caminho.
 *
 * ## Por que este teste lê o código em vez de renderizar
 *
 * O projeto não tem nenhum teste de componente — `vitest.config` roda em
 * ambiente `node`. Introduzir jsdom e uma convenção nova para guardar um achado
 * deste tamanho seria desproporcional; a prova de comportamento é a medição no
 * navegador acima. Aqui guarda-se a decisão estrutural que a sustenta: o padrão
 * da aba é uma decisão de ABERTURA, congelada na primeira resposta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TABS = readFileSync(
  join(process.cwd(), "src/app/(app)/fidelidade/_components/fidelidade-tabs.tsx"),
  "utf8",
);

describe("FDU-3 — a aba padrão é decidida uma vez, não recalculada", () => {
  it("congela o padrão de abertura em vez de derivar do total a cada render", () => {
    expect(
      TABS,
      "derivar a aba de `semCampanha` a cada render faz ela SALTAR quando a " +
        "primeira campanha nasce: o operador aperta 'Criar' e cai numa lista " +
        "vazia, sem ver o que acabou de cadastrar.",
    ).toMatch(/const \[padraoInicial, setPadraoInicial\] = useState<string \| null>\(null\)/);
    expect(TABS).toMatch(/if \(padraoInicial === null && campanhas\.isSuccess\)/);
  });

  it("guarda o padrão em estado, não em ref", () => {
    // Escrever/ler ref durante o render quebra com o React Compiler
    // (`react-hooks/refs`) — a primeira tentativa usou `useRef` e o lint
    // reprovou com 5 erros. Typecheck e teste passavam.
    expect(TABS).not.toMatch(/useRef/);
  });

  it("a aba ativa NÃO depende de `semCampanha`", () => {
    const linha = TABS.split("\n").find((l) => /^\s*const tab =/.test(l)) ?? "";
    expect(linha, "linha `const tab =` não encontrada").not.toBe("");
    expect(
      linha,
      `\`${linha.trim()}\` volta a ler o estado atual — é exatamente o que fazia ` +
        `a aba saltar.`,
    ).not.toMatch(/semCampanha|\.total|data\.total/);
    expect(linha).toMatch(/tabEscolhida \?\? padraoInicial/);
  });

  it("a escolha explícita do operador tem precedência", () => {
    // O congelamento não pode endurecer a aba: clicar ainda troca, e
    // `tabEscolhida` vem primeiro no encadeamento.
    const linha = TABS.split("\n").find((l) => /^\s*const tab =/.test(l)) ?? "";
    expect(linha.indexOf("tabEscolhida")).toBeLessThan(linha.indexOf("padraoInicial"));
    expect(TABS).toMatch(/onValueChange=\{setTab\}/);
  });

  it("mantém o comportamento do FDU-2 (sem campanha abre em Campanhas)", () => {
    // O que se corrige é a aba se MOVER, não a regra de abertura.
    expect(TABS).toMatch(/campanhas\.data\.total === 0 \? "campanhas" : "submissoes"/);
  });
});
