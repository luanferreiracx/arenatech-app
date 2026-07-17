# Runbook — Esplora self-hosted (elementsd + waterfalls)

Fonte on-chain Liquid própria do LWK (ADR 0059). Elimina o SPOF das Esploras
públicas que causou o cache corrompido / saldo inflado.

## Onde vive

- **VPS:** `ssh contabo`, diretório `/opt/waterfalls/` (compose + `elements.conf` +
  `elements_rpc.secret`). **Secrets ficam só na VPS** (não no repo).
- **Containers:** `elements` (nó) e `waterfalls` (backend Esplora), na rede
  `arenatech-prod_arenatech` (a mesma do `arenatech-lwk-wallet`).
- **Imagens (digest-pinned):** `blockstream/elementsd:23.3.3` +
  `blockstream/waterfalls@sha256:4d01…`.

## Segurança

- O `elements` é **watch-only, SEM chaves privadas** — só lê blocos e transmite tx já
  assinada pelo LWK. O `rpcpassword` dá acesso a consulta de chain + broadcast
  (público), **não** a fundos. Blast radius mínimo.
- Sem porta exposta no host: só acessível pela rede docker interna.
- `validatepegin=0` → não exige nó Bitcoin (trade-off aceito: não valida peg-in de BTC).

## Comandos

```bash
# Status + progresso do IBD
ssh contabo 'docker exec elements elements-cli -datadir=/data -conf=/etc/elements/elements.conf getblockchaininfo \
  | grep -E "blocks|headers|verificationprogress|initialblockdownload|size_on_disk"'
# Pronto quando: initialblockdownload=false e verificationprogress≈1.0

# Logs do waterfalls (indexação)
ssh contabo 'docker logs waterfalls --tail 30'

# Smoke test da superfície REST (do container do LWK, mesma rede)
ssh contabo 'docker exec arenatech-lwk-wallet python3 -c "import urllib.request as u; print(u.urlopen(\"http://waterfalls:3100/blocks/tip/hash\",timeout=8).read().decode())"'

# Subir / reiniciar a stack
ssh contabo 'cd /opt/waterfalls && docker compose up -d'

# Espaço em disco (monitorar — a chain cresce continuamente)
ssh contabo 'df -h / | tail -1; docker system df'
```

## Rotas: o que o waterfalls SERVE vs NÃO serve

- **Serve** (base `http://waterfalls:3100`, SEM `/liquid/api`): `/blocks/tip/hash`,
  `/tx/:txid/raw`, `POST /tx` (broadcast), `/block/:hash/header`, `/block-height/:h`,
  `/address/:addr/txs`, `/v2/waterfalls`, `/v1/unspent/:txid:vout`.
- **NÃO serve** (cai no fallback público, ou usar outra fonte): `/blocks/tip/height`,
  `/tx/:txid` (JSON), **`/tx/:txid/outspend/:vout`**, `/address/:addr` (stats).
- ⚠️ O **detector de spent-status** (`depix-cache-integrity.service.ts`) usa
  `/outspend` → manter `DEPIX_ESPLORA_OUTSPEND_URL` no **blockstream** (default).
  Não apontar pro waterfalls.

## Cutover (promover a fonte própria) — só APÓS IBD + indexação completos

1. Paridade: comparar tip + saldo/UTXOs da central (waterfalls próprio vs público).
2. `/opt/lwk-wallet/.env`: `ESPLORA_URL=http://waterfalls:3100` → `cd /opt/lwk-wallet && docker compose up -d`.
   Públicas permanecem como fallback (o `app.py` monta a lista). Conferir `/readiness`.

## Reparo do cache da central (o incidente do saldo inflado)

Só depois do cutover (rescan precisa de fonte que não rate-limita).

```bash
# 1. Backup do dir de cache (reversível)
ssh contabo 'docker exec arenatech-lwk-wallet tar czf /tmp/central-cache-bak.tgz -C /app/wallet_data dd308431-0525-417a-97c5-459e4b6cf45a'
# 2. Apagar SÓ os arquivos de cache do wollet — NUNCA descriptor.txt / mnemonic.txt
#    (o diretório de cache do LWK dentro de wallet_data/<central>/; preservar as chaves)
# 3. Rescan completo via waterfalls (full_scan sem rate-limit) — pela API do LWK ou script
# 4. Conferir: saldo da central deve cair para ~R$ 131,21 (era R$ 4.304,44 inflado)
```

> Alvo do rescan já provado: **R$ 131,21** (a única UTXO de DePix viva; as outras 20
> estão gastas). Ver ADR 0059 e a memória `depix-saldo-obsoleto-cache-2026-07-17`.

## Falhas comuns

- **waterfalls em `Restarting`** com `invalid value 'Liquid'` → usar `--network=liquid`
  (minúsculo).
- **`EMFILE`/"Too many open files"** → RocksDB; `ulimit nofile` já em 65536 no compose.
- **Disco enchendo** → a chain cresce; monitorar `df -h /`. Se apertar, expandir disco.
- **waterfalls 404 em `/blocks/tip/height` ou `/tx/{txid}`** → esperado (não serve
  essas rotas); o app cai no fallback público, sem quebra.
