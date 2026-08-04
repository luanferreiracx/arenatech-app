/**
 * Sincronização dos templates aprovados na WABA do tenant.
 *
 * O problema: `APPROVED_TEMPLATES` lista o que está aprovado na conta da Arena
 * Tech. Um tenant que trouxe a própria WABA (BYO) não tem esses templates — e
 * FORA da janela de 24h a Meta só aceita template aprovado. O resultado hoje
 * seria: dentro de 24h tudo funciona, fora dela toda mensagem falha, e ninguém
 * entende por quê.
 *
 * O que a sincronização faz: pergunta à Meta quais templates ESTA WABA tem
 * aprovados, e guarda a lista. Ela NÃO substitui o catálogo — os metadados que
 * o código precisa para montar os componentes (`params`, `hasDocumentHeader`,
 * `isOtp`) não existem na resposta da Meta; são conhecimento nosso sobre como
 * cada template é usado.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchApprovedTemplateNames,
  tenantHasTemplate,
} from "@/lib/services/whatsapp-template-sync";

function respostaMeta(paginas: unknown[]) {
  let i = 0;
  return vi.fn(async () => {
    const corpo = paginas[i++] ?? { data: [] };
    return new Response(JSON.stringify(corpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("templates aprovados da WABA", () => {
  it("devolve os nomes aprovados", async () => {
    vi.stubGlobal(
      "fetch",
      respostaMeta([
        {
          data: [
            { name: "padrao", language: "pt_BR", status: "APPROVED", category: "UTILITY" },
            { name: "os_concluida", language: "pt_BR", status: "APPROVED", category: "UTILITY" },
          ],
        },
      ]),
    );

    const r = await fetchApprovedTemplateNames({ token: "EAAG", wabaId: "123" });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.names).toEqual(["padrao", "os_concluida"]);
  });

  it("ignora template que NÃO está aprovado", async () => {
    // PENDING e REJECTED não servem: enviar por eles falha. Guardá-los como se
    // servissem só adiaria a descoberta para a hora do envio.
    vi.stubGlobal(
      "fetch",
      respostaMeta([
        {
          data: [
            { name: "aprovado", language: "pt_BR", status: "APPROVED" },
            { name: "esperando", language: "pt_BR", status: "PENDING" },
            { name: "recusado", language: "pt_BR", status: "REJECTED" },
            { name: "pausado", language: "pt_BR", status: "PAUSED" },
          ],
        },
      ]),
    );

    const r = await fetchApprovedTemplateNames({ token: "EAAG", wabaId: "123" });

    if (r.ok) expect(r.names).toEqual(["aprovado"]);
  });

  it("segue a paginação até o fim", async () => {
    // A Meta pagina por cursor. Parar na primeira página deixaria templates de
    // fora e o tenant veria "não aprovado" para algo que ele aprovou.
    vi.stubGlobal(
      "fetch",
      respostaMeta([
        {
          data: [{ name: "pagina1", status: "APPROVED" }],
          paging: { next: "https://graph.facebook.com/v22.0/123/message_templates?after=CURSOR" },
        },
        { data: [{ name: "pagina2", status: "APPROVED" }] },
      ]),
    );

    const r = await fetchApprovedTemplateNames({ token: "EAAG", wabaId: "123" });

    if (r.ok) expect(r.names).toEqual(["pagina1", "pagina2"]);
  });
});

describe("quando a Meta recusa", () => {
  it("token sem permissão sobre a WABA vira motivo legível", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: { code: 190, message: "Invalid OAuth access token" } }),
          { status: 401 },
        ),
      ),
    );

    const r = await fetchApprovedTemplateNames({ token: "ruim", wabaId: "123" });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/token/i);
      expect(r.message).not.toContain("OAuth");
    }
  });

  it("rede fora não vira 'sem templates'", async () => {
    // A diferença importa: lista vazia significaria "o tenant não aprovou
    // nada", e a tela mandaria ele aprovar templates que já existem.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));

    const r = await fetchApprovedTemplateNames({ token: "EAAG", wabaId: "123" });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/n[ãa]o conseguimos|tente/i);
  });
});

/**
 * A pergunta que o ENVIO faz antes de tentar um template fora da janela de 24h.
 * Errar aqui em qualquer direção custa: para mais, bloqueia mensagem que
 * funcionaria; para menos, tenta um template que a Meta vai recusar.
 */
describe("o tenant pode usar este template?", () => {
  it("sim, quando está na lista aprovada dele", () => {
    expect(tenantHasTemplate(["padrao", "os_concluida"], "padrao")).toBe(true);
  });

  it("não, quando a lista dele não tem", () => {
    // É o caso que motiva tudo isto: o template existe na conta da Arena Tech,
    // mas não na WABA deste tenant.
    expect(tenantHasTemplate(["padrao"], "os_concluida")).toBe(false);
  });

  it("lista NUNCA sincronizada (null) permite tentar", () => {
    // `null` significa "não sabemos", não "não tem". Bloquear por falta de
    // informação desligaria o WhatsApp de quem acabou de conectar — o defeito
    // seria pior que o que se quer evitar. Deixa tentar; a Meta é a autoridade.
    expect(tenantHasTemplate(null, "qualquer")).toBe(true);
  });

  it("lista VAZIA (sincronizada, sem nada aprovado) bloqueia", () => {
    // Diferente de `null`: aqui a Meta respondeu e disse que não há template.
    // Tentar seria gastar chamada para receber recusa garantida.
    expect(tenantHasTemplate([], "padrao")).toBe(false);
  });
});
