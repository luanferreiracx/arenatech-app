/**
 * Credencial da WhatsApp Cloud API por tenant: como é guardada e como é lida.
 *
 * O token de um tenant autoriza enviar mensagem em nome da loja dele. Vazado,
 * permite falar com os clientes daquela loja se passando por ela. Guardá-lo em
 * claro numa coluna JSON — que aparece em dump, backup, log de query lenta e na
 * tela de quem tem acesso ao banco — seria o mesmo erro que o projeto já evitou
 * no 2FA e na carteira LWK.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  sealCloudCredential,
  readCloudCredential,
  WHATSAPP_CLOUD_SECRET_CONTEXT,
} from "@/lib/services/whatsapp-tenant-config";

beforeAll(() => {
  // `sealSecret` deriva a chave do NEXTAUTH_SECRET.
  process.env.NEXTAUTH_SECRET ??= "segredo-de-teste-para-cifrar-credenciais";
});

const TOKEN = "EAAG-token-permanente-do-system-user";

describe("credencial em repouso", () => {
  it("guarda o token CIFRADO — nunca em claro", async () => {
    const config = sealCloudCredential({ token: TOKEN, phoneNumberId: "105954558954427" });

    // O ponto: o valor gravado não contém o token.
    expect(JSON.stringify(config)).not.toContain(TOKEN);
    // O phoneNumberId NÃO é segredo — é identificador público do número, e
    // deixá-lo legível permite diagnosticar sem decifrar nada.
    expect(config.phoneNumberId).toBe("105954558954427");
  });

  it("o que foi cifrado volta idêntico na leitura", async () => {
    const config = sealCloudCredential({ token: TOKEN, phoneNumberId: "105954558954427" });
    const lido = readCloudCredential(config);

    expect(lido?.token).toBe(TOKEN);
    expect(lido?.phoneNumberId).toBe("105954558954427");
  });

  it("usa um contexto de cifragem próprio", () => {
    // O `context` do secret-box separa domínios: um valor cifrado para a
    // carteira não se decifra como credencial de WhatsApp, nem o contrário.
    expect(WHATSAPP_CLOUD_SECRET_CONTEXT).toContain("whatsapp");
  });
});
