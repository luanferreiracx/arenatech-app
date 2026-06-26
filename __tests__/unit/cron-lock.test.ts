/**
 * withCronLock: lock cooperativo por job (P1-4). Banco mockado — valida que a
 * aquisicao atomica (INSERT ... ON CONFLICT DO UPDATE WHERE expired) decide se
 * o job roda, e que o lock e sempre liberado no fim.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const queryRaw = vi.fn(); // aquisicao (RETURNING)
const updateMany = vi.fn(); // liberacao

const tx = { $queryRaw: queryRaw, cronLock: { updateMany } };

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
}));

import { withCronLock } from "@/server/cron-lock";

beforeEach(() => {
  queryRaw.mockReset();
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("withCronLock", () => {
  it("roda fn quando adquire o lock (RETURNING devolve 1 linha)", async () => {
    queryRaw.mockResolvedValueOnce([{ job_name: "job-a" }]);
    const fn = vi.fn().mockResolvedValue(undefined);

    const ran = await withCronLock("job-a", fn);

    expect(ran).toBe(true);
    expect(fn).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalled(); // liberou
  });

  it("NAO roda quando outra instancia segura o lock (RETURNING vazio)", async () => {
    queryRaw.mockResolvedValueOnce([]); // ON CONFLICT nao atualizou (lease vivo)
    const fn = vi.fn();

    const ran = await withCronLock("job-b", fn);

    expect(ran).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled(); // nada a liberar
  });

  it("libera o lock mesmo se fn lancar", async () => {
    queryRaw.mockResolvedValueOnce([{ job_name: "job-c" }]);
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(withCronLock("job-c", fn)).rejects.toThrow("boom");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ jobName: "job-c" }) }),
    );
  });
});
