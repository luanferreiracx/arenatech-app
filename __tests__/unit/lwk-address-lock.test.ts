import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda do incidente 2026-08-08: QR de depósito falhava com "LWK indisponível"
 * a cada ciclo do cron de sync.
 *
 * O cron segura o `wallet_lock` da carteira durante todo o `full_scan` (~70s com
 * a Esplora própria). O `address/new` entrava na fila desse lock e o app abortava
 * aos 30s — uma janela de indisponibilidade de ~70s por ciclo, decidida por azar
 * de segundo. Medido: sync 69,3s, `address/new` disparado 3s depois levou 66,7s.
 *
 * Não há suíte Python neste repo, então este teste lê o fonte. É um guarda
 * grosseiro de propósito: afirma só o que distingue o código correto do que
 * causou o incidente — que o `address/new` NÃO usa `with wallet_lock(...)`, a
 * forma que espera para sempre. Um teste que exigisse a implementação exata
 * quebraria em qualquer refactor legítimo.
 */
const APP_PY = readFileSync(join(process.cwd(), "lwk", "app.py"), "utf8");

/** Corpo do handler `new_address`, do decorator até a próxima rota. */
function newAddressHandler(): string {
  const start = APP_PY.indexOf('@app.route("/wallet/<tenant_id>/address/new"');
  expect(start, "handler address/new não encontrado em lwk/app.py").toBeGreaterThan(-1);
  const next = APP_PY.indexOf("@app.route(", start + 1);
  return APP_PY.slice(start, next === -1 ? undefined : next);
}

describe("lwk address/new não bloqueia atrás do full_scan", () => {
  it("não usa `with wallet_lock` — essa forma espera o sync inteiro", () => {
    // Era exatamente esta linha que causava o incidente.
    expect(newAddressHandler()).not.toMatch(/with\s+wallet_lock\(/);
  });

  it("adquire o lock com timeout e o libera", () => {
    const handler = newAddressHandler();
    expect(handler).toMatch(/lock\.acquire\(timeout=/);
    // Sem release, a carteira trava de vez no primeiro pedido — pior que o bug.
    expect(handler).toMatch(/lock\.release\(\)/);
  });

  it("espera quase nada quando não vai sincronizar", () => {
    // Derivar sem sync só lê o cache local, então pode correr em paralelo ao
    // full_scan. Esperar aqui é justamente o que reintroduz a indisponibilidade.
    const semSync = /LOCK_WAIT_NO_SYNC_S\s*=\s*(\d+)/.exec(APP_PY);
    expect(semSync, "LOCK_WAIT_NO_SYNC_S não definido").not.toBeNull();
    expect(Number(semSync![1])).toBeLessThanOrEqual(2);
  });

  it("desiste antes do timeout do app quando o sync foi pedido", () => {
    // O app aborta em ADDRESS_TIMEOUT_MS (30s). Esperar mais que isso devolve o
    // controle ao cliente só depois de a tela já ter falhado.
    const comSync = /LOCK_WAIT_SYNC_S\s*=\s*(\d+)/.exec(APP_PY);
    expect(comSync, "LOCK_WAIT_SYNC_S não definido").not.toBeNull();
    expect(Number(comSync![1])).toBeLessThan(30);
  });
});
