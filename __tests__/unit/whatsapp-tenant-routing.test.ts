/**
 * De QUAL conta da Meta a mensagem sai.
 *
 * Errar isso é o pior defeito possível desta feature: a mensagem chega ao
 * cliente, ninguém vê erro nenhum, e ela saiu do número ERRADO — da nossa conta
 * em vez da conta da loja, ou da conta de outra loja. Não há alarme para isso;
 * o sintoma é o cliente estranhar de quem veio a mensagem.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@/server/db", () => ({
  withAdmin: async (fn: (tx: unknown) => unknown) =>
    fn({ tenantIntegration: { findUnique } }),
}));

import { sendCloudText } from "@/lib/services/whatsapp-cloud-service";
import { sealCloudCredential } from "@/lib/services/whatsapp-tenant-config";

process.env.NEXTAUTH_SECRET ??= "segredo-de-teste";

/** Captura para qual URL e com qual token a mensagem foi enviada. */
function capturarEnvio() {
  const chamadas: Array<{ url: string; token: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      chamadas.push({ url, token: init.headers.Authorization ?? "" });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
    }),
  );
  return chamadas;
}

beforeEach(() => {
  findUnique.mockReset();
  process.env.WHATSAPP_CLOUD_TOKEN = "TOKEN-DA-ARENA";
  process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = "999000111";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WHATSAPP_CLOUD_TOKEN;
  delete process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
});

describe("tenant com credencial própria", () => {
  it("envia pela conta DELE, não pela nossa", async () => {
    findUnique.mockResolvedValue({
      enabled: true,
      config: sealCloudCredential({ token: "TOKEN-DA-LOJA", phoneNumberId: "555444333" }),
    });
    const chamadas = capturarEnvio();

    await sendCloudText("86999998888", "oi", "tenant-1");

    expect(chamadas).toHaveLength(1);
    // O número da URL é o do tenant, e o token também.
    expect(chamadas[0]!.url).toContain("555444333");
    expect(chamadas[0]!.url).not.toContain("999000111");
    expect(chamadas[0]!.token).toBe("Bearer TOKEN-DA-LOJA");
  });

  it("integração DESABILITADA volta para a conta do ambiente", async () => {
    // Desligar no painel tem que devolver o envio ao caminho anterior, não
    // deixar o tenant sem WhatsApp nenhum.
    findUnique.mockResolvedValue({
      enabled: false,
      config: sealCloudCredential({ token: "TOKEN-DA-LOJA", phoneNumberId: "555444333" }),
    });
    const chamadas = capturarEnvio();

    await sendCloudText("86999998888", "oi", "tenant-1");

    expect(chamadas[0]!.token).toBe("Bearer TOKEN-DA-ARENA");
    expect(chamadas[0]!.url).toContain("999000111");
  });
});

describe("tenant sem credencial própria", () => {
  it("usa a conta do ambiente — o comportamento de hoje segue valendo", async () => {
    // Fallback, não substituição: trocar de uma vez desligaria o WhatsApp de
    // todo mundo que ainda não configurou o seu.
    findUnique.mockResolvedValue(null);
    const chamadas = capturarEnvio();

    await sendCloudText("86999998888", "oi", "tenant-sem-config");

    expect(chamadas[0]!.token).toBe("Bearer TOKEN-DA-ARENA");
  });

  it("sem tenantId nenhum, nem consulta o banco", async () => {
    // Caminhos que não sabem o tenant (verificação de cadastro, por exemplo)
    // não podem pagar uma consulta a cada envio.
    const chamadas = capturarEnvio();

    await sendCloudText("86999998888", "oi");

    expect(findUnique).not.toHaveBeenCalled();
    expect(chamadas[0]!.token).toBe("Bearer TOKEN-DA-ARENA");
  });
});

describe("quando a leitura da credencial falha", () => {
  it("cai no ambiente em vez de derrubar o envio", async () => {
    // Banco fora não pode significar mensagem não enviada: o fallback é o
    // comportamento anterior, que funcionava.
    findUnique.mockRejectedValue(new Error("connection refused"));
    const chamadas = capturarEnvio();

    const r = await sendCloudText("86999998888", "oi", "tenant-1");

    expect(r.success).toBe(true);
    expect(chamadas[0]!.token).toBe("Bearer TOKEN-DA-ARENA");
  });

  it("config corrompido também cai no ambiente", async () => {
    findUnique.mockResolvedValue({ enabled: true, config: { lixo: true } });
    const chamadas = capturarEnvio();

    await sendCloudText("86999998888", "oi", "tenant-1");

    expect(chamadas[0]!.token).toBe("Bearer TOKEN-DA-ARENA");
  });
});
