/**
 * Scheduler do Talison — debounce por generation.
 *
 * Verifica que: cada agendamento grava uma generation nova no Redis; quando
 * o timer dispara, só processa se a generation for a mais recente (a rajada
 * de balõezinhos vira uma resposta só). Sem Redis, processa imediato.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const redisStore = new Map<string, string>();
const fakeRedis = {
  get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => {
    redisStore.set(key, value);
    return "OK";
  }),
};

vi.mock("@/lib/redis", () => ({ getRedis: () => fakeRedis }));

const processConversation = vi.fn(async () => ({ status: "replied" as const }));
vi.mock("@/lib/talison/runner", () => ({
  processConversation: (...args: unknown[]) => processConversation(...args),
}));

import { scheduleTalisonRun } from "@/lib/talison/scheduler";

describe("scheduleTalisonRun (debounce por generation)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    redisStore.clear();
    processConversation.mockClear();
    fakeRedis.get.mockClear();
    fakeRedis.set.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("processa uma vez quando há um único agendamento", async () => {
    await scheduleTalisonRun("tenant-1", "conv-1");
    await vi.runAllTimersAsync();
    expect(processConversation).toHaveBeenCalledOnce();
    expect(processConversation).toHaveBeenCalledWith("tenant-1", "conv-1");
  });

  it("descarta o disparo obsoleto: rajada de 3 mensagens → 1 processamento", async () => {
    // 3 mensagens seguidas, cada uma reagenda e regrava a generation.
    await scheduleTalisonRun("tenant-1", "conv-1");
    await scheduleTalisonRun("tenant-1", "conv-1");
    await scheduleTalisonRun("tenant-1", "conv-1");

    await vi.runAllTimersAsync();

    // Só o último timer encontra sua generation como a vigente; os 2 primeiros
    // veem uma generation mais nova e desistem.
    expect(processConversation).toHaveBeenCalledOnce();
  });
});
