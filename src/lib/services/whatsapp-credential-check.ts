/**
 * Verifica um par (token, phoneNumberId) da WhatsApp Cloud API contra a Graph
 * API da Meta, ANTES de gravar.
 *
 * O problema que isto fecha: sem checagem, o lojista cola um token errado, vê
 * "salvo com sucesso" e descobre dias depois — quando um cliente reclama — que
 * nenhuma mensagem saiu. As formas de falhar não se anunciam: token expirado,
 * número não registrado para a Cloud API, permissão faltando no system user.
 *
 * Método: `GET /{phone-number-id}` com o token no header. É a checagem mais
 * barata que prova as DUAS coisas de uma vez — que o token vale e que ele tem
 * permissão sobre AQUELE número.
 */
import { logger } from "@/lib/logger";

/** Campos do phone number node que interessam ao diagnóstico. */
export type CloudCredentialOk = {
  ok: true;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
};

/** Por que a credencial não serve. A máquina decide pelo `reason`. */
export type CloudCredentialFailureReason =
  | "invalid_token"
  | "phone_number_not_found"
  | "phone_not_verified"
  | "network_error"
  | "unknown";

/**
 * Teto para a chamada à Meta. Sem ele, a requisição pode pendurar até o timeout
 * do runtime e a pessoa fica olhando um botão girando sem saber se salvou.
 * Mesma ordem de grandeza do timeout já usado no envio (`whatsapp-cloud-service`).
 */
const META_TIMEOUT_MS = 15_000;

export type CloudCredentialFailure = {
  ok: false;
  reason: CloudCredentialFailureReason;
  /** Texto para a PESSOA ler, em português. Nunca o erro cru da Meta. */
  message: string;
};

export type CloudCredentialCheck = CloudCredentialOk | CloudCredentialFailure;

/** Erro da Graph API, na forma que a Meta documenta. */
type GraphError = { message?: string; type?: string; code?: number };

/**
 * Traduz o erro da Meta para algo acionável.
 *
 * O texto da Meta vem em inglês e fala de OAuth, WABA e permissões de system
 * user — vocabulário de quem integra API, não de quem administra uma loja.
 * Repassá-lo cru seria jogar o problema no colo de quem não pode resolvê-lo.
 */
function traduzirErro(status: number, error: GraphError | undefined): CloudCredentialFailure {
  // 190 = OAuthException. Cobre token expirado, revogado e malformado — para
  // quem configura, os três têm a mesma saída: gerar um token novo.
  if (error?.code === 190 || status === 401) {
    return {
      ok: false,
      reason: "invalid_token",
      message:
        "O token não foi aceito pela Meta. Ele pode ter expirado ou sido revogado — gere um token permanente novo no Business Manager e cole aqui.",
    };
  }

  // 100 = objeto não encontrado. O token pode estar perfeito; quem está errado é
  // o ID. Chamar isso de "token inválido" mandaria a pessoa gerar um token novo
  // — que não resolve — e ela tentaria em círculo.
  if (error?.code === 100) {
    return {
      ok: false,
      reason: "phone_number_not_found",
      message:
        "A Meta não encontrou esse ID do número. Confira o campo “ID do número de telefone” no painel da Meta (WhatsApp › Configuração da API) — não é o número em si, é o ID numérico ao lado dele.",
    };
  }

  return {
    ok: false,
    reason: "unknown",
    message: `A Meta recusou a verificação (HTTP ${status}). Confira o token e o ID do número no painel da Meta e tente de novo.`,
  };
}

export async function checkCloudCredentials(input: {
  token: string;
  phoneNumberId: string;
}): Promise<CloudCredentialCheck> {
  const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(input.phoneNumberId)}?fields=display_phone_number,verified_name,code_verification_status,quality_rating`;

  let response: Response;
  let body: Record<string, unknown> & { error?: GraphError };
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${input.token}` },
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
    body = (await response.json()) as Record<string, unknown> & { error?: GraphError };
  } catch (error) {
    // Rede fora, DNS, timeout. NÃO é credencial inválida — dizer que é faria a
    // pessoa trocar um token que estava certo. E sem este `catch` a exceção
    // subiria, virando erro 500 numa tela de configuração.
    logger.warn("WhatsApp Cloud: verificação não alcançou a Meta", {
      phoneNumberId: input.phoneNumberId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      reason: "network_error",
      message:
        "Não conseguimos falar com a Meta agora. Isso não quer dizer que os dados estão errados — tente de novo em alguns instantes.",
    };
  }

  if (!response.ok) {
    const falha = traduzirErro(response.status, body.error);
    // Sem o token no log, nem em pedaço: log é lido por mais gente do que quem
    // pode ver credencial.
    logger.warn("WhatsApp Cloud: credencial recusada", {
      phoneNumberId: input.phoneNumberId,
      status: response.status,
      reason: falha.reason,
      metaCode: body.error?.code,
    });
    return falha;
  }

  // HTTP 200 não basta: o número pode existir e ainda não ter completado a
  // verificação na Meta, e aí o envio falha. Aceitar aqui salvaria uma
  // configuração que não entrega mensagem — o defeito que este módulo existe
  // para impedir.
  const verificationStatus = body.code_verification_status;
  if (typeof verificationStatus === "string" && verificationStatus !== "VERIFIED") {
    logger.warn("WhatsApp Cloud: número sem verificação concluída", {
      phoneNumberId: input.phoneNumberId,
      codeVerificationStatus: verificationStatus,
    });
    return {
      ok: false,
      reason: "phone_not_verified",
      message:
        "Este número ainda não concluiu a verificação na Meta. Termine a verificação no painel da Meta (WhatsApp › Configuração da API) e tente de novo.",
    };
  }

  logger.info("WhatsApp Cloud: credencial verificada", { phoneNumberId: input.phoneNumberId });

  return {
    ok: true,
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: typeof body.display_phone_number === "string" ? body.display_phone_number : null,
    verifiedName: typeof body.verified_name === "string" ? body.verified_name : null,
    qualityRating: typeof body.quality_rating === "string" ? body.quality_rating : null,
  };
}
