/**
 * Credencial da WhatsApp Cloud API POR TENANT (BYO — o lojista traz a própria
 * conta da Meta).
 *
 * Formato gravado em `TenantIntegration.config` do provider `WHATSAPP_CLOUD`:
 *
 *   { phoneNumberId: string, tokenSealed: string, wabaId?: string }
 *
 * O token vai SEMPRE cifrado. Ele autoriza enviar mensagem em nome da loja —
 * vazado, permite falar com os clientes dela se passando por ela. Em claro numa
 * coluna JSON, apareceria em dump, backup, log de query lenta e na tela de quem
 * tem acesso ao banco. Mesmo cuidado do 2FA e da carteira LWK.
 *
 * O `phoneNumberId` fica legível de propósito: é identificador público do
 * número, e deixá-lo em claro permite diagnosticar (e indexar, e mostrar na
 * tela) sem precisar decifrar nada.
 */
import { sealSecret, openSecret } from "@/lib/security/secret-box";

/**
 * Domínio de cifragem. O `context` do secret-box separa usos: um valor cifrado
 * para a carteira não se decifra como credencial de WhatsApp, nem o contrário.
 */
export const WHATSAPP_CLOUD_SECRET_CONTEXT = "whatsapp-cloud-token";

/** O que fica gravado no `config` da integração. */
export type CloudCredentialConfig = {
  phoneNumberId: string;
  tokenSealed: string;
  wabaId?: string;
};

/** O que o código usa em memória, com o token já em claro. */
export type CloudCredential = {
  phoneNumberId: string;
  token: string;
  wabaId?: string;
};

export function sealCloudCredential(input: {
  token: string;
  phoneNumberId: string;
  wabaId?: string;
}): CloudCredentialConfig {
  return {
    phoneNumberId: input.phoneNumberId,
    tokenSealed: sealSecret(input.token, WHATSAPP_CLOUD_SECRET_CONTEXT),
    ...(input.wabaId ? { wabaId: input.wabaId } : {}),
  };
}

/**
 * Lê o `config` gravado. Devolve `null` quando o JSON não tem o formato
 * esperado — integração criada à mão, migrada de outro provider, ou corrompida.
 * `null` é tratado como "sem credencial", que faz o envio cair no fallback de
 * ambiente em vez de estourar.
 */
export function readCloudCredential(config: unknown): CloudCredential | null {
  if (!config || typeof config !== "object") return null;
  const raw = config as Record<string, unknown>;
  const phoneNumberId = raw.phoneNumberId;
  const tokenSealed = raw.tokenSealed;
  if (typeof phoneNumberId !== "string" || typeof tokenSealed !== "string") return null;
  if (!phoneNumberId.trim() || !tokenSealed.trim()) return null;

  return {
    phoneNumberId,
    token: openSecret(tokenSealed, WHATSAPP_CLOUD_SECRET_CONTEXT),
    ...(typeof raw.wabaId === "string" && raw.wabaId ? { wabaId: raw.wabaId } : {}),
  };
}
