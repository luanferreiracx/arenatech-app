/**
 * Resolve o `src` da imagem do QR PIX vinda da Eulen.
 *
 * O campo se chama `qrCodeBase64`, mas o nome mente: a Eulen passou a devolver
 * também uma **URL** (`https://resources.eulen.app/qr/pix/...`). Medido em
 * produção em 2026-08-07: `qr_code_base64` com 67 caracteres começando em
 * `https://`.
 *
 * Quem só tratava "data:" ou base64 puro prefixava `data:image/png;base64,` numa
 * URL e a imagem simplesmente não carregava — o copia-e-cola aparecia, o QR não.
 * O sintoma engana porque o campo NÃO está vazio: a checagem `if (!qrCodeBase64)`
 * passa, e o defeito só aparece na renderização.
 *
 * Existe como módulo único porque a mesma lógica estava repetida em seis telas
 * (PDV, quick-sale, assinatura, transações, link público…). Formato de terceiro
 * que muda é exatamente o que não pode ter seis cópias da regra.
 */

/** `null` quando não há imagem — quem chama decide o fallback. */
export function resolveQrImageSrc(qrCodeBase64: string | null | undefined): string | null {
  const raw = (qrCodeBase64 ?? "").trim();
  if (!raw) return null;
  // Já é data-url pronta.
  if (raw.startsWith("data:")) return raw;
  // URL hospedada pela Eulen (formato novo).
  if (/^https?:\/\//i.test(raw)) return raw;
  // Base64 cru (formato antigo).
  return `data:image/png;base64,${raw}`;
}
