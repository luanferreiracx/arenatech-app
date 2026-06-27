import { describe, it, expect, vi, beforeEach } from "vitest";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { logger } from "@/lib/logger";

describe("logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    captureException.mockClear();
  });

  it("outputs valid JSON for info level", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test message");

    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed["level"]).toBe("info");
    expect(parsed["message"]).toBe("test message");
    expect(parsed["timestamp"]).toBeDefined();
  });

  it("outputs valid JSON for error level", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("something broke");

    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed["level"]).toBe("error");
    expect(parsed["message"]).toBe("something broke");
  });

  it("encaminha logger.error ao Sentry com o contexto REDIGIDO (sem vazar secret)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("boom", { saleId: "x", password: "super-secret" });

    // O forward ao Sentry e fire-and-forget via import dinamico — resolve num microtask.
    await new Promise((r) => setTimeout(r, 0));

    expect(captureException).toHaveBeenCalledTimes(1);
    const call = captureException.mock.calls[0] as [Error, { extra?: Record<string, unknown> }];
    expect(call[0]).toBeInstanceOf(Error);
    expect(call[0].message).toBe("boom");
    // Contexto vai com a MESMA redacao do log — secret nao chega ao Sentry.
    expect(call[1]?.extra?.["saleId"]).toBe("x");
    expect(call[1]?.extra?.["password"]).toBe("***");
  });

  it("NAO encaminha logger.info/warn ao Sentry (so error)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.info("ok");
    logger.warn("aviso");
    await new Promise((r) => setTimeout(r, 0));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("outputs valid JSON for warn level", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("watch out");

    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed["level"]).toBe("warn");
  });

  it("outputs valid JSON for debug level", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.debug("debug info");

    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed["level"]).toBe("debug");
  });

  it("includes context when provided", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("with context", { userId: "123", action: "login" });

    const output = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const context = parsed["context"] as Record<string, unknown>;

    expect(context["userId"]).toBe("123");
    expect(context["action"]).toBe("login");
  });

  it("omits context key when not provided", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("no context");

    const output = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed).not.toHaveProperty("context");
  });

  it("includes ISO timestamp", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("timestamp check");

    const output = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const ts = parsed["timestamp"] as string;

    // Should be a valid ISO date string
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it("redaciona chaves sensiveis automaticamente", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", {
      userId: "abc",
      password: "super-secret",
      apiKey: "sk_live_xxx",
      token: "bearer-yyy",
      nested: {
        secret: "inner",
        publicField: "ok",
      },
    });

    const output = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const context = parsed["context"] as Record<string, unknown>;

    expect(context["userId"]).toBe("abc");
    expect(context["password"]).toBe("***");
    expect(context["apiKey"]).toBe("***");
    expect(context["token"]).toBe("***");
    const nested = context["nested"] as Record<string, unknown>;
    expect(nested["secret"]).toBe("***");
    expect(nested["publicField"]).toBe("ok");
  });

  it("redaciona match case-insensitive", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", {
      Password: "x",
      PASSWORD_HASH: "y",
      Authorization: "Bearer abc",
    });

    const output = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const context = parsed["context"] as Record<string, unknown>;

    expect(context["Password"]).toBe("***");
    expect(context["PASSWORD_HASH"]).toBe("***");
    expect(context["Authorization"]).toBe("***");
  });

  it("redaciona dentro de arrays", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test", {
      users: [
        { id: 1, password: "x" },
        { id: 2, token: "y" },
      ],
    });

    const output = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const context = parsed["context"] as Record<string, unknown>;
    const users = context["users"] as Array<Record<string, unknown>>;

    expect(users[0]?.["password"]).toBe("***");
    expect(users[1]?.["token"]).toBe("***");
  });
});
