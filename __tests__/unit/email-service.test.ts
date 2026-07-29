/**
 * Comportamento do envio de e-mail (Resend).
 *
 * Guarda dois incidentes de produção (2026-07-28):
 *  - código de verificação NO-KYC chegou "delivered" na Resend mas o Outlook
 *    engoliu: o e-mail saía só-HTML, sem a parte `text/plain`;
 *  - reset de senha morto havia semanas porque o remetente global
 *    (`@arenatechpi.com.br`) não estava verificado na Resend — a 403 se perdia
 *    no meio de um "HTTP 4xx" genérico e ninguém olhava.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmail } from "@/lib/services/email-service";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

function okResponse() {
  return { ok: true, status: 200, json: async () => ({ id: "msg-1" }) };
}

function bodyOf(call: unknown[]): Record<string, unknown> {
  const init = call[1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

const ORIGINAL_KEY = process.env.RESEND_API_KEY;

beforeEach(() => {
  mockFetch.mockReset();
  process.env.RESEND_API_KEY = "re_test";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL_KEY;
});

describe("sendEmail", () => {
  it("nunca envia só-HTML: deriva a parte em texto puro quando o chamador não passa", async () => {
    mockFetch.mockResolvedValue(okResponse());

    await sendEmail({
      to: "a@b.com",
      subject: "Seu código de verificação",
      html: "<p>Seu código é:</p><p style='font-size:28px'>123456</p>",
    });

    const body = bodyOf(mockFetch.mock.calls[0]!);
    expect(body["text"]).toContain("123456");
    expect(body["text"]).not.toContain("<p>");
  });

  it("preserva o link na versão em texto (reset de senha sem link é inútil)", async () => {
    mockFetch.mockResolvedValue(okResponse());

    await sendEmail({
      to: "a@b.com",
      subject: "Redefinir senha",
      html: `<a href="https://app.exemplo/reset?token=abc">Redefinir Senha</a>`,
    });

    expect(bodyOf(mockFetch.mock.calls[0]!)["text"]).toContain(
      "https://app.exemplo/reset?token=abc",
    );
  });

  it("respeita o texto puro informado pelo chamador", async () => {
    mockFetch.mockResolvedValue(okResponse());

    await sendEmail({ to: "a@b.com", subject: "s", html: "<p>ignorado</p>", text: "escrito à mão" });

    expect(bodyOf(mockFetch.mock.calls[0]!)["text"]).toBe("escrito à mão");
  });

  it("reporta falha acionável quando o domínio do remetente não está verificado", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        '{"statusCode":403,"message":"The arenatechpi.com.br domain is not verified."}',
    });

    const result = await sendEmail({
      to: "a@b.com",
      subject: "s",
      html: "<p>x</p>",
      from: "noreply@arenatechpi.com.br",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("noreply@arenatechpi.com.br");
    expect(result.error).toContain("nao verificado");
  });

  it("cai num remetente de domínio verificado quando EMAIL_FROM não está setado", async () => {
    mockFetch.mockResolvedValue(okResponse());
    vi.stubEnv("EMAIL_FROM", "");

    await sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>" });

    expect(bodyOf(mockFetch.mock.calls[0]!)["from"]).toBe("PDV DEPIX <noreply@pdvdepix.app>");
    vi.unstubAllEnvs();
  });

  it("põe nome visível no endereço pelado (endereço sozinho pontua pior nos filtros)", async () => {
    mockFetch.mockResolvedValue(okResponse());

    await sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>", from: "noreply@pdvdepix.app" });

    expect(bodyOf(mockFetch.mock.calls[0]!)["from"]).toBe("PDV DEPIX <noreply@pdvdepix.app>");
  });

  it("respeita remetente que já vem com nome", async () => {
    mockFetch.mockResolvedValue(okResponse());

    await sendEmail({
      to: "a@b.com",
      subject: "s",
      html: "<p>x</p>",
      from: "Loja X <contato@pdvdepix.app>",
    });

    expect(bodyOf(mockFetch.mock.calls[0]!)["from"]).toBe("Loja X <contato@pdvdepix.app>");
  });

  it("só manda reply_to quando existe", async () => {
    mockFetch.mockResolvedValue(okResponse());

    await sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>" });
    expect(bodyOf(mockFetch.mock.calls[0]!)).not.toHaveProperty("reply_to");

    await sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>", replyTo: "suporte@b.com" });
    expect(bodyOf(mockFetch.mock.calls[1]!)["reply_to"]).toEqual(["suporte@b.com"]);
  });

  it("recusa envio em produção sem RESEND_API_KEY em vez de fingir sucesso", async () => {
    delete process.env.RESEND_API_KEY;
    vi.stubEnv("NODE_ENV", "production");

    const result = await sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>" });

    expect(result.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
