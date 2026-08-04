/**
 * Quais templates a WABA do tenant tem APROVADOS na Meta.
 *
 * O problema que resolve: `APPROVED_TEMPLATES` (catálogo do código) lista o que
 * está aprovado na conta da Arena Tech. Um tenant que trouxe a própria WABA não
 * tem esses templates, e FORA da janela de 24h a Meta só aceita template
 * aprovado. Sem esta consulta, o sintoma é cruel: dentro de 24h tudo funciona,
 * fora dela toda mensagem falha, e nada na tela explica por quê.
 *
 * O que este módulo NÃO faz: substituir o catálogo. Os metadados que o código
 * usa para montar os componentes (`params`, `hasDocumentHeader`, `isOtp`) não
 * vêm na resposta da Meta — são conhecimento nosso sobre COMO cada template é
 * usado. A sincronização responde uma pergunta só: "este tenant tem este
 * template aprovado?".
 *
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/templates
 */
import { logger } from "@/lib/logger";

const META_TIMEOUT_MS = 15_000;
/** Teto de páginas — a Meta pagina por cursor e um loop sem freio trava o cron. */
const MAX_PAGES = 20;

export type TemplateSyncResult =
  | { ok: true; names: string[] }
  | { ok: false; reason: "invalid_token" | "network_error" | "unknown"; message: string };

type MetaTemplate = { name?: unknown; status?: unknown };
type MetaPage = {
  data?: MetaTemplate[];
  paging?: { next?: string };
  error?: { code?: number; message?: string };
};

/**
 * Lista os nomes dos templates APROVADOS da WABA.
 *
 * Só `APPROVED` entra: `PENDING`, `REJECTED` e `PAUSED` não servem para enviar,
 * e guardá-los como se servissem só adiaria a descoberta para a hora do envio.
 */
export async function fetchApprovedTemplateNames(input: {
  token: string;
  wabaId: string;
}): Promise<TemplateSyncResult> {
  const apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION ?? "v22.0";
  let url: string | undefined =
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(input.wabaId)}/message_templates` +
    `?fields=name,language,status,category&limit=100`;

  const names: string[] = [];

  for (let page = 0; page < MAX_PAGES && url; page++) {
    let body: MetaPage;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${input.token}` },
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
      });
      body = (await response.json()) as MetaPage;

      if (!response.ok || body.error) {
        return traduzirErro(response.status, body.error, input.wabaId);
      }
    } catch (error) {
      // Rede fora NÃO é "sem templates": lista vazia significaria que o tenant
      // não aprovou nada, e a tela mandaria ele aprovar o que já existe.
      logger.warn("WhatsApp templates: não alcançou a Meta", {
        wabaId: input.wabaId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        reason: "network_error",
        message:
          "Não conseguimos consultar seus templates na Meta agora. Tente de novo em alguns instantes.",
      };
    }

    for (const template of body.data ?? []) {
      if (typeof template.name === "string" && template.status === "APPROVED") {
        names.push(template.name);
      }
    }
    url = body.paging?.next;
  }

  logger.info("WhatsApp templates sincronizados", { wabaId: input.wabaId, total: names.length });
  return { ok: true, names };
}

/**
 * Este tenant pode usar este template? Pergunta que o ENVIO faz antes de tentar
 * um template fora da janela de 24h.
 *
 * `null` (nunca sincronizado) devolve `true`: significa "não sabemos", não "não
 * tem". Bloquear por falta de informação desligaria o WhatsApp de quem acabou
 * de conectar — defeito pior que o que se quer evitar. Deixa tentar; a Meta é a
 * autoridade final e a recusa dela já é tratada.
 *
 * Lista VAZIA é diferente: a Meta respondeu e disse que não há template
 * aprovado. Tentar seria gastar chamada para receber recusa garantida.
 */
export function tenantHasTemplate(
  approvedTemplates: string[] | null,
  templateName: string,
): boolean {
  if (approvedTemplates === null) return true;
  return approvedTemplates.includes(templateName);
}

function traduzirErro(
  status: number,
  error: { code?: number; message?: string } | undefined,
  wabaId: string,
): TemplateSyncResult {
  logger.warn("WhatsApp templates: Meta recusou", { wabaId, status, metaCode: error?.code });

  if (error?.code === 190 || status === 401) {
    return {
      ok: false,
      reason: "invalid_token",
      message:
        "O token não foi aceito pela Meta ao consultar seus templates. Confira se ele tem permissão sobre a conta do WhatsApp Business.",
    };
  }
  // 100 = objeto não encontrado: aqui costuma ser o WABA ID errado, não o token.
  if (error?.code === 100) {
    return {
      ok: false,
      reason: "unknown",
      message:
        "A Meta não encontrou essa conta do WhatsApp Business. Confira o ID da conta (WABA ID) no painel da Meta.",
    };
  }
  return {
    ok: false,
    reason: "unknown",
    message: `A Meta recusou a consulta de templates (HTTP ${status}). Tente de novo em alguns instantes.`,
  };
}
