/**
 * CFG-1 (Etapa 9, Módulo 14 — Configurações): o rótulo do fuso do Nordeste era
 * cortado justamente no UTC.
 *
 * ## Medido a 320px
 *
 * ```
 * "Nordeste (Fortaleza/Teresina/Recife, UTC-3)"   283px  numa caixa de 222
 * gatilho mostrava:  "Nordeste (Fortaleza/Teres…"
 * ```
 *
 * O `UTC-3` — a única informação que distingue um fuso do outro — ficava fora.
 * Num seletor de fuso horário, é o dado que decide.
 *
 * ## A correção é no RÓTULO, não no CSS
 *
 * A tela já estava correta: `min-w-0` no container, `w-full` no `SelectTrigger`.
 * Nenhuma largura acomoda 283px em 222 — o texto é que era longo demais, e só
 * ele: os outros sete rótulos seguem `"Região (Cidade, UTC-x)"` e cabem.
 *
 * ## A tentativa que piorou
 *
 * Tentei preservar as três cidades num campo `detail`, exibido só na lista
 * aberta. **Não funciona**: o `SelectItem` do projeto envolve todo o `children`
 * em `SelectPrimitive.ItemText`, e o Radix copia o conteúdo inteiro para o
 * gatilho — o corte foi de 61px para **73px**, pior que o original.
 *
 * Separar exigiria alterar o componente base compartilhado, o que o padrão do
 * projeto desaconselha. Ficou o rótulo curto.
 *
 * ## Varredura das 19 telas
 *
 * Este foi o **único** achado real do módulo. Dois falsos positivos descartados:
 *
 * - `/partner-api` acusou um `<ol>` transbordando em 336px — era o container do
 *   **Sonner** (toasts), `offsetParent === null`, invisível ao usuário. O
 *   detector não filtrava elementos ocultos.
 * - a mesma tela mostra "API de Parceiros não habilitada para esta loja", que é
 *   estado legítimo, não erro de carregamento.
 */
import { describe, it, expect } from "vitest";
import { COMMON_TIMEZONES } from "@/lib/validators/bot-config";

/**
 * Teto empírico: a caixa do `SelectTrigger` mede **222px** a 320px de viewport, e
 * o rótulo cabe até ~33 caracteres nessa fonte. O de 43 caracteres media 283px.
 */
const MAX_CARACTERES_ROTULO = 34;

describe("CFG-1 — rótulos de fuso cabem no seletor a 320px", () => {
  it("nenhum rótulo estoura o gatilho", () => {
    const longos = COMMON_TIMEZONES.filter((tz) => tz.label.length > MAX_CARACTERES_ROTULO).map(
      (tz) => `${tz.label} (${tz.label.length} chars)`,
    );
    expect(
      longos,
      `a caixa do gatilho tem 222px a 320px de viewport. O rótulo do Nordeste ` +
        `tinha 43 caracteres (283px) e era cortado no "UTC-3" — justamente o que ` +
        `distingue um fuso do outro.`,
    ).toEqual([]);
  });

  it("todo rótulo mantém o UTC — é o que decide a escolha", () => {
    for (const tz of COMMON_TIMEZONES) {
      expect(tz.label, `"${tz.label}" sem UTC`).toMatch(/UTC-\d/);
    }
  });

  it("o rótulo do Nordeste não voltou a listar três cidades", () => {
    const nordeste = COMMON_TIMEZONES.find((tz) => tz.value === "America/Fortaleza");
    expect(nordeste).toBeDefined();
    expect(nordeste!.label).not.toMatch(/Teresina|Recife/);
    expect(nordeste!.label).toMatch(/UTC-3/);
  });

  it("não reintroduz `detail` — o Radix copia tudo para o gatilho", () => {
    // O `SelectItem` do projeto envolve o children inteiro em `ItemText`, então
    // conteúdo extra no item vaza para o gatilho: corte foi de 61px para 73px.
    for (const tz of COMMON_TIMEZONES) {
      expect(Object.keys(tz), `${tz.value} tem campo extra`).toEqual(["value", "label"]);
    }
  });

  it("cobre os fusos do Brasil", () => {
    // Encurtar não pode ter derrubado opção: quem é de Manaus ou do Acre precisa
    // encontrar o próprio fuso.
    const valores = COMMON_TIMEZONES.map((tz) => tz.value);
    for (const esperado of [
      "America/Sao_Paulo",
      "America/Fortaleza",
      "America/Manaus",
      "America/Rio_Branco",
      "America/Noronha",
    ]) {
      expect(valores).toContain(esperado);
    }
  });
});
