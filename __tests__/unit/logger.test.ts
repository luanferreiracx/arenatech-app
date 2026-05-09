import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
