/**
 * guardedLookup: fecha a janela de DNS-rebinding (auditoria SSRF WH-1). Em vez de
 * resolver+checar ANTES do fetch (deixando o fetch re-resolver e conectar a um IP
 * privado num TTL curto), este lookup é o MESMO que a conexão usa — ele bloqueia se
 * o IP resolvido no momento do connect for interno. Sem TOCTOU.
 *
 * Testamos o comportamento de bloqueio injetando um resolver fake (não faz DNS real).
 */
import { describe, it, expect } from "vitest";
import { makeGuardedLookup } from "@/lib/security/ssrf";

// Assinatura do callback do dns.lookup do node: (err, address, family) | (err, addresses[])
function run(lookup: ReturnType<typeof makeGuardedLookup>, host: string, opts: object = {}) {
  return new Promise<{ err: Error | null; result: unknown }>((resolve) => {
    lookup(host, opts, (err: Error | null, ...result: unknown[]) =>
      resolve({ err, result }),
    );
  });
}

describe("makeGuardedLookup", () => {
  it("deixa passar quando o resolver devolve IP público", async () => {
    const lookup = makeGuardedLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    const { err } = await run(lookup, "example.com", { all: true });
    expect(err).toBeNull();
  });

  it("BLOQUEIA quando o resolver devolve loopback (rebinding p/ 127.0.0.1)", async () => {
    const lookup = makeGuardedLookup(async () => [{ address: "127.0.0.1", family: 4 }]);
    const { err } = await run(lookup, "rebind.evil", { all: true });
    expect(err).toBeInstanceOf(Error);
  });

  it("BLOQUEIA quando o resolver devolve IP privado (10/8)", async () => {
    const lookup = makeGuardedLookup(async () => [{ address: "10.0.0.5", family: 4 }]);
    const { err } = await run(lookup, "rebind.evil", { all: true });
    expect(err).toBeInstanceOf(Error);
  });

  it("BLOQUEIA se QUALQUER endereço resolvido for interno (mistura pública+metadata)", async () => {
    const lookup = makeGuardedLookup(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    const { err } = await run(lookup, "rebind.evil", { all: true });
    expect(err).toBeInstanceOf(Error);
  });

  it("BLOQUEIA quando o resolver não devolve nenhum endereço", async () => {
    const lookup = makeGuardedLookup(async () => []);
    const { err } = await run(lookup, "nowhere.evil", { all: true });
    expect(err).toBeInstanceOf(Error);
  });

  it("propaga falha de resolução como erro (fail-closed)", async () => {
    const lookup = makeGuardedLookup(async () => {
      throw new Error("SERVFAIL");
    });
    const { err } = await run(lookup, "broken.evil", { all: true });
    expect(err).toBeInstanceOf(Error);
  });

  it("modo all:false → retorna (address, family) do IP público", async () => {
    const lookup = makeGuardedLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    const { err, result } = await run(lookup, "example.com", {});
    expect(err).toBeNull();
    expect(result).toEqual(["93.184.216.34", 4]);
  });
});
