/**
 * recordWebhookEvent (G-P1-16): unique-violation (P2002) = replay -> false;
 * erro transitorio (DB down) NAO e replay -> relanca (nao engole evento real).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const create = vi.fn();

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) => fn({ webhookEvent: { create } }),
}));

import { recordWebhookEvent } from "@/lib/webhooks/replay-guard";

const params = {
  provider: "eulen_deposit",
  eventId: "q1:depix_sent",
  payload: { any: true },
};

beforeEach(() => {
  create.mockReset();
});

describe("recordWebhookEvent", () => {
  it("evento novo -> true", async () => {
    create.mockResolvedValue({});
    await expect(recordWebhookEvent(params)).resolves.toBe(true);
  });

  it("unique violation (P2002) = replay -> false", async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );
    await expect(recordWebhookEvent(params)).resolves.toBe(false);
  });

  it("erro transitorio (nao-P2002) -> relanca (nao vira falso duplicado)", async () => {
    create.mockRejectedValue(new Error("connection terminated"));
    await expect(recordWebhookEvent(params)).rejects.toThrow("connection terminated");
  });

  it("outro erro Prisma conhecido (nao P2002) tambem relanca", async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("timeout", { code: "P2024", clientVersion: "x" }),
    );
    await expect(recordWebhookEvent(params)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});
