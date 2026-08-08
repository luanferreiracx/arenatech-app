/**
 * `qrCodeBase64` da Eulen nem sempre é base64 — desde 2026-08 ela também devolve
 * URL. Quem prefixava `data:image/png;base64,` cegamente quebrava a imagem: o
 * copia-e-cola aparecia e o QR não, com o campo POPULADO (então nenhuma checagem
 * de "vazio" pegava).
 */
import { describe, it, expect } from "vitest";
import { resolveQrImageSrc } from "@/lib/depix/qr-image-src";

describe("resolveQrImageSrc", () => {
  it("URL da Eulen é usada como está — prefixar base64 quebraria a imagem", () => {
    const url = "https://resources.eulen.app/qr/pix/019fd8b1c2";
    expect(resolveQrImageSrc(url)).toBe(url);
  });

  it("base64 cru vira data-url (formato antigo, ainda em uso)", () => {
    expect(resolveQrImageSrc("iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("data-url pronta passa intacta, sem duplicar o prefixo", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    expect(resolveQrImageSrc(dataUrl)).toBe(dataUrl);
  });

  it("http (sem TLS) também é URL — não é base64", () => {
    expect(resolveQrImageSrc("http://exemplo/qr.png")).toBe("http://exemplo/qr.png");
  });

  it("vazio, espaços, null e undefined => null (quem chama mostra o fallback)", () => {
    expect(resolveQrImageSrc("")).toBeNull();
    expect(resolveQrImageSrc("   ")).toBeNull();
    expect(resolveQrImageSrc(null)).toBeNull();
    expect(resolveQrImageSrc(undefined)).toBeNull();
  });
});
