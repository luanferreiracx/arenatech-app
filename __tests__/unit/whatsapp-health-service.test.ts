/**
 * A verificação periódica das credenciais, com as regras combinadas.
 *
 * As peças puras têm testes próprios; aqui se verifica o COMPORTAMENTO do
 * conjunto — o que é gravado, quem é avisado, e o que acontece quando a Meta
 * não responde. É a costura que erra na prática.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type EmailArg = { to: string; subject: string; html: string };
const sendEmail = vi.fn(async (_arg: EmailArg) => ({ success: true, messageId: "x" }));
vi.mock("@/lib/services/email-service", () => ({
  sendEmail: (arg: EmailArg) => sendEmail(arg),
}));

import { runCloudHealthCheck } from "@/server/services/whatsapp-health.service";
import { sealCloudCredential } from "@/lib/services/whatsapp-tenant-config";

process.env.NEXTAUTH_SECRET ??= "segredo-de-teste";

const AGORA = new Date("2026-08-03T12:00:00Z");
const CONFIG = sealCloudCredential({ token: "EAAG-token", phoneNumberId: "105954558954427" });

function candidato(over: Partial<Parameters<typeof runCloudHealthCheck>[0]["candidates"][number]> = {}) {
  return {
    integrationId: "int-1",
    tenantId: "tenant-1",
    tenantName: "Loja do Teste",
    config: CONFIG as never,
    previousReason: null,
    previousHealthOk: null,
    notifiedAt: null,
    ...over,
  };
}

function respostaMeta(status: number, corpo: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } }),
    ),
  );
}

const NUMERO_OK = {
  display_phone_number: "5586999998888",
  verified_name: "Loja do Teste",
  code_verification_status: "VERIFIED",
  quality_rating: "GREEN",
};

let gravado: Array<{ id: string; data: Record<string, unknown> }>;

function deps(candidates: ReturnType<typeof candidato>[]) {
  return {
    candidates,
    now: AGORA,
    appUrl: "https://pdvdepix.app",
    persist: async (id: string, data: Record<string, unknown>) => {
      gravado.push({ id, data });
    },
    recipients: async () => ["dono@loja.test"],
  };
}

beforeEach(() => {
  gravado = [];
  sendEmail.mockClear();
  sendEmail.mockImplementation(async () => ({ success: true, messageId: "x" }));
});

afterEach(() => vi.unstubAllGlobals());

describe("credencial saudável", () => {
  it("grava o sucesso e não incomoda ninguém", async () => {
    respostaMeta(200, NUMERO_OK);

    const r = await runCloudHealthCheck(deps([candidato()]));

    expect(r.ok).toBe(1);
    expect(r.broken).toBe(0);
    expect(gravado[0]!.data.healthOk).toBe(true);
    expect(gravado[0]!.data.healthReason).toBeNull();
    // O silêncio é o comportamento certo: e-mail de "está tudo bem" todo dia é
    // exatamente o ruído que faz o alerta de verdade ser ignorado.
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("credencial quebrada", () => {
  it("avisa o admin do tenant na primeira vez, com link para corrigir", async () => {
    respostaMeta(401, { error: { code: 190, message: "expired" } });

    const r = await runCloudHealthCheck(deps([candidato()]));

    expect(r.broken).toBe(1);
    expect(r.notified).toBe(1);
    expect(gravado[0]!.data.healthOk).toBe(false);
    expect(gravado[0]!.data.healthReason).toBe("invalid_token");
    expect(gravado[0]!.data.healthNotifiedAt).toEqual(AGORA);

    const email = sendEmail.mock.calls[0]![0];
    expect(email.to).toBe("dono@loja.test");
    expect(email.subject).toMatch(/Ação necessária/i);
    expect(email.html).toContain("/settings/whatsapp");
    // O token NUNCA pode chegar num e-mail.
    expect(email.html).not.toContain("EAAG-token");
  });

  it("NÃO repete o aviso quando o problema é o mesmo", async () => {
    respostaMeta(401, { error: { code: 190, message: "expired" } });

    const r = await runCloudHealthCheck(
      deps([
        candidato({
          previousReason: "invalid_token",
          previousHealthOk: false,
          notifiedAt: new Date("2026-08-02T12:00:00Z"),
        }),
      ]),
    );

    expect(r.broken).toBe(1);
    expect(r.notified).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    // Regrava a verificação (o carimbo de "quando checamos" avança), mas NÃO
    // mexe no `healthNotifiedAt` — senão o silêncio se perderia.
    expect(gravado[0]!.data.healthCheckedAt).toEqual(AGORA);
    expect(gravado[0]!.data.healthNotifiedAt).toBeUndefined();
  });
});

describe("credencial que volta a funcionar", () => {
  it("avisa a recuperação e limpa o estado", async () => {
    respostaMeta(200, NUMERO_OK);

    const r = await runCloudHealthCheck(
      deps([
        candidato({
          previousReason: "invalid_token",
          previousHealthOk: false,
          notifiedAt: new Date("2026-08-02T12:00:00Z"),
        }),
      ]),
    );

    expect(r.recovered).toBe(1);
    // Limpar o carimbo importa: se quebrar de novo amanhã, o aviso sai na hora
    // em vez de ficar preso pelo "já avisei".
    expect(gravado[0]!.data.healthNotifiedAt).toBeNull();
    expect(sendEmail.mock.calls[0]![0].subject).toMatch(
      /voltou a funcionar/i,
    );
  });
});

describe("quando a Meta não responde", () => {
  it("não dá veredito nem avisa — problema nosso não é culpa da credencial", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));

    const r = await runCloudHealthCheck(deps([candidato()]));

    expect(r.skipped).toBe(1);
    expect(r.broken).toBe(0);
    // Nada gravado: marcar `healthOk: false` aqui faria a tela dizer ao lojista
    // que a credencial dele quebrou quando quem falhou fomos nós.
    expect(gravado).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("um tenant quebrado não atrapalha os outros", () => {
  it("segue verificando depois de uma falha", async () => {
    // O cron varre todos; parar no primeiro erro deixaria os demais sem
    // verificação e ninguém notaria.
    let chamada = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        chamada++;
        return chamada === 1
          ? new Response(JSON.stringify({ error: { code: 190 } }), { status: 401 })
          : new Response(JSON.stringify(NUMERO_OK), { status: 200 });
      }),
    );

    const r = await runCloudHealthCheck(
      deps([
        candidato({ integrationId: "int-1", tenantId: "t1" }),
        candidato({ integrationId: "int-2", tenantId: "t2" }),
      ]),
    );

    expect(r.checked).toBe(2);
    expect(r.broken).toBe(1);
    expect(r.ok).toBe(1);
  });
});
