/**
 * Guardião do auto-reparo do cache do LWK (incidente 2026-07-28).
 *
 * O saque TXW20260727-00002 falhou com "LWK indisponivel" e o saldo da carteira
 * central respondeu `internal_error` por horas. Causa raiz: o cache do LWK
 * corrompeu (`UpdateOnDifferentStatus`) e o auto-reparo — que existe justamente
 * pra isso — vinha falhando a cada 20min desde a madrugada, porque ele ABRIA o
 * cache vivo antes de reparar. Com corrupção severa o construtor do Wollet
 * lança, então o script morria no caso em que era indispensável. E falhava em
 * silêncio (só exit 1 no journal).
 *
 * Estes testes travam as propriedades cuja perda reproduz o incidente. Elas são
 * contra-intuitivas o bastante pra alguém "simplificar" de volta:
 *
 * - Cache ilegível tem que ser tratado como corrupção reparável, não como erro.
 * - Falha tem que ALERTAR (silêncio foi o que deixou sangrar 7h).
 * - Scan fresco só entra se for estável entre duas passadas E sem UTXO gasto.
 *   Esploras servem dados PARCIAIS sem erro: durante o incidente a blockstream
 *   devolveu R$3.294 pra uma carteira de R$9.698. Instalar isso como verdade
 *   apagaria saldo visível.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const script = readFileSync(
  join(process.cwd(), "ops", "depix-cache-autorepair.sh"),
  "utf8",
);
const compose = readFileSync(
  join(process.cwd(), "lwk", "docker-compose.yml"),
  "utf8",
);

describe("auto-reparo do cache LWK", () => {
  it("trata cache ilegível como corrupção reparável em vez de morrer", () => {
    // O construtor do Wollet no cache vivo precisa estar protegido...
    expect(script).toMatch(/try:\s*\n\s*wc = lwk\.Wollet/);
    // ...e a ausência de cache legível precisa ter um caminho de reparo próprio.
    expect(script).toContain("REPAIR_ILEGIVEL");
    expect(script).toMatch(/if cache is None:/);
  });

  it("não usa `set -e` (que matava o script antes de decidir)", () => {
    // `set -euo pipefail` fazia o docker exec não-zero abortar tudo. Queremos
    // capturar o rc e ALERTAR, não morrer.
    expect(script).not.toMatch(/^set -euo pipefail$/m);
    expect(script).toMatch(/^set -uo pipefail$/m);
  });

  it("alerta quando o reparo falha", () => {
    expect(script).toMatch(/alert\(\)/);
    expect(script).toMatch(/if \[ \$RC -ne 0 \]/);
    // Alerta precisa sair do arquivo de log (logger -> syslog/journal).
    expect(script).toMatch(/logger -t depix-cache-autorepair/);
  });

  it("exige scan estável entre duas passadas antes de instalar", () => {
    // Defesa contra Esplora servindo dados parciais sem erro.
    expect(script).toMatch(/a = scan\(b, HEAL\)/);
    expect(script).toMatch(/bb = scan\(b, HEAL\)/);
    expect(script).toMatch(/if a != bb:/);
  });

  it("nunca instala um scan fresco que contenha UTXO gasto ou indeterminado", () => {
    expect(script).toContain("SKIP_FRESCO_SUJO");
    expect(script).toMatch(/if bad or unknown:/);
  });

  it("só remove do cache UTXO comprovadamente gasto", () => {
    expect(script).toContain("SKIP_REMOVIDO_VIVO");
    expect(script).toMatch(/if spent\(op\) is not True:/);
  });

  it("faz backup antes de trocar e nunca toca no descriptor/mnemonic", () => {
    expect(script).toMatch(/mv "\$TEN\/liquid" "\$TEN\/liquid\.bak-\$TS"/);
    // O script só pode mexer no diretório de cache `liquid/`.
    expect(script).not.toMatch(/rm .*descriptor\.txt/);
    expect(script).not.toMatch(/rm .*mnemonic/);
  });

  it("prioriza a waterfalls como fonte primária (ADR 0059)", () => {
    const bases = script.slice(script.indexOf("BASES = ["));
    const first = bases.slice(0, bases.indexOf("]"));
    expect(first).toMatch(/waterfalls\.liquidwebwallet\.org/);
    // waterfalls tem que vir antes das demais.
    expect(first.indexOf("waterfalls")).toBeLessThan(first.indexOf("liquid.network"));
    expect(first.indexOf("waterfalls")).toBeLessThan(first.indexOf("blockstream"));
  });
});

describe("exposição de rede do LWK", () => {
  it("não publica a porta em 0.0.0.0", () => {
    // O LWK assina transações de dinheiro e a API inteira é protegida por uma
    // única API key. `"5000:5000"` liga em todas as interfaces — qualquer host
    // que alcance a máquina alcança a carteira. Loopback no dev; em produção o
    // compose da VPS usa `expose` (nem no host aparece).
    const portLines = compose
      .split("\n")
      .filter((l) => /^\s*-\s*"?\d+:\d+"?\s*$/.test(l));
    expect(
      portLines,
      `porta publicada em todas as interfaces: ${portLines.join(", ")}`,
    ).toHaveLength(0);
  });
});

describe("fonte on-chain do LWK", () => {
  it("mantém a waterfalls como padrão do compose (ADR 0059)", () => {
    // O `.env` da VPS tinha derivado pra liquid.network, que dava timeout
    // constante e foi o que corrompeu o cache. O padrão versionado é a rede de
    // segurança quando alguém sobe o serviço sem `.env`.
    expect(compose).toMatch(
      /ESPLORA_URL:\s*\$\{ESPLORA_URL:-https:\/\/waterfalls\.liquidwebwallet\.org\/liquid\/api\}/,
    );
  });
});
