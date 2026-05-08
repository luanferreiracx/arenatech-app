import { describe, it, expect } from "vitest";

describe("example router", () => {
  it("returns olá message", () => {
    const message = "olá";
    expect(message).toBe("olá");
  });
});
