# ADR 0059 — Fonte on-chain própria para o LWK (Esplora self-hosted)

**Status:** IMPLEMENTADA — cutover em 2026-08-06 (ver adendo). A fonte própria
(`https://esplora.pdvdepix.app`) é a **primária** do LWK; as públicas seguem como
fallback.
**Data:** 2026-07-17
**Contexto relacionado:** incidente do saldo inflado da carteira central (2026-07),
[[depix-saldo-obsoleto-cache-2026-07-17]], PR #602 (guards de exibição + detector).

---

## Contexto

O LWK (carteira Liquid/DePix) sincroniza saldo e detecta depósitos consultando
**Esploras públicas de terceiros** — `waterfalls.liquidwebwallet.org` (primária),
`blockstream.info/liquid`, `liquid.network` (fallbacks). Essa dependência é a
**raiz de dois incidentes reais**:

1. **Cache corrompido → saldo inflado.** O `full_scan` do LWK é incremental e
   nunca purga UTXO gasto. Quando as Esploras degradam durante gastos, o cache
   captura UTXOs que depois são gastos on-chain e **os prende** — inflando o
   saldo. A carteira central exibiu **R$4.304,44 vs R$131,21 real** (20 de 21
   UTXOs de DePix estavam gastos). Confirmado on-chain.
2. **Rescan corretivo bloqueado.** Para reparar (purge + rescan) é preciso um
   `full_scan` completo — mas as Esploras públicas **rate-limitam a rajada**
   ("Too many retry") mesmo com `concurrency=1`, e `waterfalls` fica fora do ar.
   Ou seja: quando mais precisamos, elas falham.

Sintomas anteriores da mesma raiz: alertas de timeout da Eulen por cross-check LWK
lento ([[eulen-webhook-lwk-timeout]]); Esploras públicas "morreram" ≥2x
([[lwk-cache-saldo-inflado]]).

**É um SPOF de terceiro sobre um caminho de dinheiro.** Não temos SLA, não
controlamos rate-limit, e a degradação é silenciosa (o cache serve valor velho
com cara de fresco — mitigado agora pelos guards do #602, mas isso é curativo).

## Decisão

**Rodar nossa própria fonte on-chain Liquid** e apontar o LWK para ela como
**primária**, mantendo as públicas como **fallback** (anti-SPOF ao contrário: a
nossa cai → cai numa pública; nunca ficamos sem fonte). Elimina o rate-limit de
terceiro e torna o rescan corretivo sempre possível.

O LWK já suporta a troca via `ESPLORA_URL` (ordem de fallback em `app.py`) e o
cliente `EsploraClientBuilder(waterfalls=…, concurrency=…)` — **não exige mudança
de código da aplicação**, só de infraestrutura + configuração.

### Restrição dura a resolver ANTES de provisionar (honestidade de recursos)

A VPS atual (Contabo): **6 vCPU, 11 GiB RAM, 45 GiB livres de 96 GiB.** Um Esplora
Liquid completo = **elementsd (full node) + índice electrs**. O índice electrs é
grande e pesado de I/O/RAM. **45 GiB livres provavelmente NÃO comportam** node +
índice com folga de crescimento.

> ⚠️ **Verificar antes de decidir o "como":** medir o tamanho real (a) do datadir
> do elementsd Liquid mainnet e (b) do índice electrs/waterfalls Liquid. Não
> assumir os números do Bitcoin (muito maiores). Só então escolher entre expandir
> disco na VPS atual vs. box separada. Isto é o **primeiro passo**, não detalhe.

## Alternativas consideradas

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **A. Manter públicas + retry/backoff** (paliativo) | Zero infra | Não resolve a raiz; rescan segue bloqueado; SPOF de terceiro permanece | ❌ Rejeitado (é o status quo que falhou) |
| **B. `waterfalls` self-hosted** (backend leve do R. Casatta, já suportado pelo LWK) | Mais leve que electrs completo; o LWK já fala waterfalls (`waterfalls=true`); full_scan em 1 requisição (sem rajada → sem rate-limit) | Ainda exige elementsd por baixo (a chain); maturidade/manutenção do projeto | ✅ **Avaliar primeiro** — pode ser o caminho mais barato que resolve |
| **C. electrs/esplora completo (Blockstream)** self-hosted | Padrão, robusto, o mesmo que blockstream.info roda | Índice grande (disco/RAM/IO); IBD longo; manutenção | ✅ Fallback se B não servir; provavelmente precisa de disco/box maior |
| **D. Esplora paga/enterprise** | Sem manter node; SLA | Custo recorrente; ainda é terceiro (mas com SLA) | 🟡 Plano B se self-host não couber no orçamento operacional |

**Recomendação de sequência:** medir tamanho → tentar **B (waterfalls self-hosted)**
por ser o mais leve que já casa com o LWK; cair para **C** se B não der; **D** como
rede de segurança se a operação de node pesar demais.

## Rollout (Strangler / parallel change — sem big-bang)

1. **Medir** datadir + índice (passo 0, destrava o resto).
2. **Provisionar** o node + backend (na VPS com disco expandido, ou box dedicada) —
   detalhes seguem `docker-infra` / `linux-server`. IBD roda em background (dias).
3. **Shadow/parallel:** apontar um LWK de teste (ou um 2º `ESPLORA_URL`) para a
   fonte própria e **comparar** saldo/tx da central contra a pública por alguns
   dias (o detector de spent-status do #602 vira o oráculo de paridade).
4. **Promover** a fonte própria a **primária** (`ESPLORA_URL`), públicas como
   fallback. Sem remover as públicas (elas viram a rede de segurança).
5. **Reparar** o cache da central (purge + rescan) **pela fonte própria** — agora o
   rescan não é rate-limitado. Verifica saldo → R$131,21.
6. **Monitorar** via o `/readiness` + `checkEsploraHealth` já existentes (agora
   apontando pra fonte própria) + o detector de UTXO-gasto.

## Consequências

**Positivas**
- Elimina o SPOF de terceiro no caminho de dinheiro; rescan corretivo sempre possível.
- Sem rate-limit → o incidente do cache corrompido deixa de recorrer por essa via.
- Fallback público preservado → a nossa fonte cair não trava a operação.
- Sem mudança de código da aplicação (só infra + `ESPLORA_URL`).

**Negativas / custos**
- **Cauda de manutenção:** um full node + índice pra manter (updates, disco,
  monitorar IBD/reorg). Bus factor a mitigar com runbook.
- **Recurso:** quase certamente exige **expandir disco** ou **box dedicada** (a
  VPS atual não comporta com folga).
- **IBD inicial** longo (dias) antes de servir.
- Não resolve sozinho o cache já corrompido — o **reparo** (passo 5) é uma ação à parte.

## Questões em aberto

1. Tamanho real do datadir Liquid + índice (electrs vs waterfalls)? → medir.
2. Expandir disco na VPS atual (Contabo permite) ou box dedicada? → depende de (1).
3. `waterfalls` self-hosted atende (opção B) ou precisamos de electrs completo (C)?
4. Recursos do IBD (RAM/IO) impactam os outros serviços da VPS durante o sync?

## Notas

Enquanto o node não sobe, o sistema está protegido pelos **curativos do #602**
(guard de exibição de saldo obsoleto + detector de UTXO-gasto que alerta a
corrupção). O reparo do cache da central (purge + rescan) fica **pendente até haver
uma fonte que complete o rescan** — hoje bloqueado pelas públicas.

---

## Estado da implementação (2026-07-17)

**Escolha:** waterfalls self-hosted (backend leve, o LWK já fala) — opção B.

**Deployado na VPS** em `/opt/waterfalls/` (fora do repo; secrets só na VPS):
- `elements` — `blockstream/elementsd:23.3.3` (digest-pinned). Nó **watch-only, SEM
  chaves** (só lê blocos + transmite tx já assinada pelo LWK). `chain=liquidv1`,
  `validatepegin=0` (sem nó Bitcoin), `txindex=1`, `rest=1`+`server=1`, ZMQ rawtx.
  Volume `elements_data`. **IBD em curso** (Liquid ~3,98M blocos; horas).
- `waterfalls` — `blockstream/waterfalls@sha256:4d01…` (digest-pinned). `--network=liquid`
  (minúsculo!), `--node-url=http://elements:7041`, `--listen 0.0.0.0:3100`, RocksDB em
  `waterfalls_db`, `nofile=65536`. Indexa em paralelo, seguindo o tip do nó.
- Ambos na rede externa `arenatech-prod_arenatech` (mesma do LWK).

**Auditoria de cutover (rotas que o app usa vs. o que o waterfalls serve):**
- `full_scan` (a chamada que rate-limitava e causou o incidente), `broadcast`
  (`POST /tx`) e `get_tip_height` (`.tip()`) usam o **`EsploraClient` do LWK** →
  rotas SERVIDAS pelo waterfalls. ✅ **Caminho crítico resolvido.**
- `verify_in_mempool` faz `GET /tx/{txid}` (JSON) cru → waterfalls 404 → **cai no
  fallback público** (inócuo; round-trip extra). Melhoria opcional: trocar por
  `/tx/{txid}/raw` ou o client do LWK.
- O **detector de spent-status (#602)** usa `/outspend`, que o waterfalls NÃO serve
  → mantém `DEPIX_ESPLORA_OUTSPEND_URL` no blockstream (default). **Não** apontar
  esse env pro waterfalls.

**Validado empiricamente:** `GET http://waterfalls:3100/blocks/tip/hash` → 200 (do
container do LWK, mesma rede).

### Passos restantes (executar QUANDO o IBD terminar)

Checar sync: `ssh contabo 'docker exec elements elements-cli -datadir=/data -conf=/etc/elements/elements.conf getblockchaininfo | grep -E "blocks|verificationprogress|initialblockdownload"'` — pronto quando `initialblockdownload:false` e `verificationprogress ≈ 1.0`. Depois, o waterfalls terminar de indexar (`docker logs waterfalls | tail`).

1. **Paridade:** comparar `tip` e o saldo/UTXOs da central via waterfalls próprio vs.
   público (o detector de spent-status vira o oráculo). Confirmar que batem.
2. **Promover:** em `/opt/lwk-wallet/.env`, setar
   `ESPLORA_URL=http://waterfalls:3100` (SEM `/liquid/api` — o público tem nginx que
   tira esse prefixo; o nosso não). Recriar o LWK: `docker compose up -d`. As
   públicas continuam de fallback (app.py monta a lista). Conferir `/readiness`.
3. **Reparar o cache da central** (o incidente): parar o monitor / o LWK; **backup**
   do dir de cache; apagar SÓ os arquivos de cache do wollet em
   `wallet_data/dd308431-.../` (**NUNCA** `descriptor.txt`/`mnemonic.txt`); rescan
   completo pelo waterfalls próprio (`full_scan`, sem rate-limit); religar; conferir
   saldo → **R$ 131,21**.
4. Apontar o monitoramento (`/readiness`, `checkEsploraHealth`) pra fonte própria.

**Runbook de operação:** ver `docs/runbooks/waterfalls-esplora.md`.

---

## Adendo 2026-07-17 — Incidente de RAM: stack PAUSADA

O IBD do `elementsd` derrubou o caminho de dinheiro. Config inicial (`dbcache=2000`,
`mem_limit 7g`) consumiu **6,7 GiB** na VPS **compartilhada** (11,68 GiB, rodando toda
a stack de produção) → **swap 100% cheio** → o LWK ficou **swap-frozen**
(`lwk_unavailable`) → o cross-check do webhook de depósito travou → **a Eulen reportou
TIMEOUT**. (Não era CPU: load 1.68/6.)

Tentei reduzir para `dbcache=300` + `mem_limit 3g`: o box recuperou, mas o `elementsd`
**OOM-loopava mesmo a 3g** — `dmesg` mostrou **anon-rss 3,1 GiB** (RSS real, não cache).
A validação de IBD da Liquid (transações confidenciais: rangeproofs/blinding) precisa
inerentemente de **~3+ GiB de RSS**, que `dbcache` não reduz.

**Conclusão:** esta VPS compartilhada **não comporta** um full node Liquid (elementsd)
junto da stack de produção de dinheiro. O erro na análise original foi olhar só o
**disco** (73 GiB, ok) e subestimar a **RAM**. Stack parada (`docker compose stop`,
volumes preservados no disco).

**Revisão da decisão:** retomar exige uma das opções, decisão do dono:
- **Box dedicada** só pra elementsd+waterfalls (isolamento de RAM/CPU) — recomendado.
- **Upgrade de RAM** da VPS atual (para ~16-24 GiB) — mantém tudo num lugar.
- **Esplora paga** (sem full node) — sem RAM de node, custo mensal.

Enquanto isso, o LWK segue nas Esploras públicas (recorrência ativa: waterfalls público
down + blockstream rate-limita o full_scan). Os curativos do #602 (guard de saldo +
detector) seguem protegendo em produção.

---

## Adendo 2026-08-06 — Cutover concluído

A stack saiu do papel: `elementsd` + `waterfalls` numa máquina dedicada (16 GiB),
exposta por Cloudflare Tunnel em `https://esplora.pdvdepix.app`. O `ESPLORA_URL`
do LWK aponta para ela; as públicas continuam na lista como fallback.

O bloqueio do adendo de 2026-07-17 (RAM) foi resolvido com upgrade de 7,7 para
15,7 GiB no host. Antes disso, cinco tentativas de IBD morreram por OOM entre 90%
e 99% — o consumo do `elementsd` não cresce de forma gradual, ele salta de ~4,3
para ~11 GiB perto do tip. Subir o teto do cgroup só adiava a morte; a correção
foi remover o limite e dar RAM real à VM.

### O que o cutover ensinou, e que a decisão original não previa

**Tip igual não prova paridade.** A fonte própria chegou a servir o mesmo bloco da
Blockstream reportando R$ 1.202 a menos de saldo. A causa era o `--max-txs-seen`,
que por padrão trunca em 100 as transações retornadas por endereço — o endereço
mais movimentado da central tem 415. O índice estava completo; a API é que
truncava. **Critério de aceitação do cutover passou a ser comparar saldo e
contagem de UTXOs contra uma pública**, nunca só o tip.

**Distância geográfica é requisito, não detalhe.** A VPS está na França e a Esplora
no Brasil: ~790 ms por requisição, das quais só 64 ms são TLS/TCP — o resto é
travessia do Atlântico. Como o `full_scan` faz centenas de requisições sequenciais,
ele leva ~70 s. Isso estourou três timeouts diferentes, em camadas distintas, todos
com o mesmo sintoma ("LWK indisponível") e causas separadas:

- o `t.join(timeout=20)` fixo dentro do LWK (PR #852);
- os 30 s do app chamando `/utxos` e `/address/new` (PR #853);
- e a ausência de qualquer sync periódico, que congelava `last_sync_ok_at` (PR #854).

### Guard-rail de primária: allowlist, não URL fixa

O aviso de boot que protege contra rebaixamento da primária comparava contra uma
URL fixa (`waterfalls.liquidwebwallet.org`). Depois do cutover ele passou a
disparar em 100% dos boots e — pior — a instruir "remova a env", o que desfaria o
cutover. Virou allowlist: a própria e o waterfalls público são primárias legítimas;
promover uma **pública de fallback** a primária, que foi o incidente de
2026-07-27/28, continua alertando.
