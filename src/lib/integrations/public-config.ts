/**
 * Contrato PÚBLICO do `config` de uma integração — o que `settings.listIntegrations`
 * pode devolver a qualquer membro do tenant.
 *
 * O endpoint é `tenantProcedure` e o PDV o consome no diálogo de pagamento: na
 * prática, todo operador de caixa recebe esta resposta. Devolver o `config` cru
 * entregaria credencial de integração a quem só precisa saber se o InfinitePay
 * está ligado.
 *
 * Allowlist EXPLÍCITO, e não denylist: campo novo em `config` fica de fora por
 * construção. O inverso — listar o que esconder — falha no dia em que alguém
 * adiciona uma chave e esquece de atualizar a lista, que é justamente o dia em
 * que o vazamento acontece. Mesmo desenho de `toPublicPlanView`.
 */

/**
 * Chaves seguras para exibição, por provider. Tudo que não está aqui é omitido.
 *
 * `handle` (InfinitePay) é o identificador público da conta de recebimento — o
 * PDV precisa dele para decidir se oferece o meio de pagamento.
 * `phoneNumberId` (WhatsApp Cloud) é identificador público do número na Meta;
 * mostrar não é risco, e permite a tela dizer QUAL número está conectado.
 *
 * O token do WhatsApp (`tokenSealed`) NUNCA entra: mesmo cifrado, não há motivo
 * para ele trafegar até o navegador.
 */
const PUBLIC_KEYS_BY_PROVIDER: Record<string, readonly string[]> = {
  INFINITEPAY: ["handle", "defaultEmail"],
  WHATSAPP_CLOUD: ["phoneNumberId", "wabaId"],
};

/**
 * `provider` é OBRIGATÓRIO: cada integração declara as próprias chaves públicas.
 * Provider sem entrada na allowlist devolve `{}` — o caminho seguro por padrão,
 * e não "devolve tudo".
 */
export function publicIntegrationConfig(
  config: unknown,
  provider: string,
): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};

  const allowed = PUBLIC_KEYS_BY_PROVIDER[provider] ?? [];
  const source = config as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in source) out[key] = source[key];
  }
  return out;
}
