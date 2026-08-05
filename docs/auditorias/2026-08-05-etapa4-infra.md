# Etapa 4 — Auditoria de Infraestrutura e Plataforma

> Programa de comercialização, etapa 4 de 6. Skill `audit-infra-platform`,
> protocolo de 4 rodadas. Data: 2026-08-05.

## Inventário

**Topologia:** VPS Contabo única (6 cores, 11 GB RAM, 96 GB disco), Docker
Compose, nginx como reverse proxy, Cloudflare na frente. Sem multi-região, sem
redundância — e isso está declarado, não disfarçado de HA.

**Serviços na VPS:** app Next.js, Postgres 18, Redis, MinIO, LWK (carteira
Liquid), Chatwoot (rails + sidekiq + postgres + redis), Evolution API
(+ postgres + redis), runner self-hosted do GitHub Actions.

**Capacidade atual:** load 1,05 de 6 cores (~17%), 6,3 GB RAM disponíveis, app
consumindo 322 MB. Uptime de 63 dias. **Capacidade não é o gargalo.**

---

## Achados

### I1 — Disco em 81%, com ~13 GB de lixo identificado

**Fato:** 78 GB de 96 GB usados; 70 GB são do Docker.

Contabilidade real (não estimativa):

| Item | Tamanho | Seguro remover? |
|---|---|---|
| `overlay2` (cache de build ativo) | 59 GB | ❌ **não** — ver abaixo |
| Volume `waterfalls_elements_data` | **5,1 GB** | ✅ Esplora abandonado em 17/07 |
| Volume do builder órfão `buildx_buildkit_*_state` | **1,9 GB** | ✅ resíduo da config antiga |
| Imagens recuperáveis | **6,0 GB** | ✅ |
| **Total recuperável com segurança** | **~13 GB** | → disco cairia para ~68% |

**Por que NÃO rodar `docker builder prune`:** o cache de 42 GB parece lixo, mas
medi a idade de todos os 587 registros — **zero têm mais de 9 dias**, nenhum tem
semanas ou meses. É cache vivo do ciclo de deploy. Limpá-lo faria o `next build`
voltar aos **631s a frio** que o ADR de build documenta, e o job de 25 min
passaria a morrer por timeout. **O ADR está certo; a tentação de limpar é a
armadilha.**

**Achado colateral:** existe um container `buildx_buildkit_builder-28e0d646...`
**rodando há 2 semanas** — resquício do `driver: docker-container` que o ADR
mandou abandonar. O CI já usa `driver: docker` corretamente (`ci.yml:399`); este
container é órfão e consome 1,9 GB sem servir a nada.

**Nota honesta:** a limpeza de imagens **já existe e funciona** — `docker image
prune -af --filter "until=24h"` roda a cada deploy (`ci.yml:694`). As 12 imagens
que encontrei são todas das últimas 26h. Cheguei a anotar "sem política de
retenção" antes de ler o workflow; estava errado.

---

### I2 — A carteira depende de um Esplora público de terceiro, e ele falhou 172 vezes

**Fato:** `arenatech-lwk-wallet` está configurado com
`ESPLORA_URL=https://waterfalls.liquidwebwallet.org/liquid/api` — **serviço
público de terceiro**, não o self-hosted.

**Prova de falha:**

```
2026-08-04 06:22:13 ERROR Todos os servidores Esplora falharam.
2026-08-04 06:30:43 ERROR Todos os servidores Esplora falharam.
```

| dia | falhas |
|---|---|
| 2026-07-31 | 1 |
| 2026-08-03 | 75 |
| 2026-08-04 | **97** |

Durante essas janelas a carteira **não conseguia sincronizar com a blockchain**.
Parou em 04/08 06:31 — porque o container foi **reiniciado** às 13:02, não porque
o terceiro se recuperou sozinho.

**O contexto que agrava:** o ADR 0059 decidiu self-hospedar o Esplora exatamente
para não depender disso (e para resolver o saldo inflado). A infraestrutura
existe na VPS — containers `elements` e `waterfalls` — mas está **parada desde
17/07**, com o `waterfalls` tendo panicado por reorg:

```
reorg failed: No reorg data found for height 46966. [...] A reindex may be required.
```

O cutover nunca aconteceu. O volume de 5,1 GB é o índice a meio caminho.

**Severidade: P1.** Dependência externa não controlada no caminho do dinheiro,
sem alerta (ninguém foi notificado das 172 falhas) e com o plano B parado há 3
semanas.

---

### I3 — 3 vulnerabilidades CRÍTICAS na biblioteca de autenticação

`pnpm audit`: **58 vulnerabilidades — 3 críticas, 25 altas, 28 moderadas, 2
baixas.** Nunca auditado antes.

**Triagem — o que realmente afeta produção:**

| Pacote | Sev | Problema | Aplicável? |
|---|---|---|---|
| `next-auth` / `@auth/core` | **CRÍTICA** | *"Configuration errors can cause existence-based auth checks to fail open"* | ✅ **sim** |
| `next-auth` / `@auth/core` | **CRÍTICA** | Normalizador de e-mail valida antes da normalização Unicode → bypass por homóglifo do `@` | ✅ sim (login por e-mail existe, ADR 0050) |
| `next` | ALTA | *"Middleware / Proxy bypass in App Router via segment-prefetch"* | ✅ **sim** — `proxy.ts` É o gate de páginas |
| `next` | ALTA | SSRF em Server Actions / rewrites; DoS | ✅ sim |
| `hono`, `@hono/node-server`, `vite` | ALTA | vários | ❌ **não** — transitivas de `prisma`/`vite`, que são **devDependencies** |

**A correção é de um dígito:**

- `@auth/core` instalado: **0.41.2** → corrigido em **0.41.3**
- `next-auth@5.0.0-beta.32` **já depende de `@auth/core@0.41.3`**; o projeto está
  na `beta.31`
- `next` 16.2.5 → **16.2.11** (mesmo minor, patch)

Verifiquei que `next-auth@5.0.0` estável **não existe** (a última é `beta.32`) —
o advisory diz "corrigido em >=5.0.0", o que sozinho sugeriria uma migração
impossível. A `beta.32` resolve.

**Mitigação existente:** a defesa em profundidade documentada na Etapa 3 limita o
dano do fail-open — mesmo que `session` viesse populada com erro, `availableTenants`
estaria vazio e `tenantProcedure` + RLS bloqueariam o acesso a dados. Não é
desculpa para não atualizar uma lib de auth.

---

## O CI/CD está sólido — e o repositório é público

Descoberta que muda a análise de supply chain: **`luanferreiracx/arenatech-app`
é PÚBLICO**. Qualquer pessoa pode abrir PR de fork.

Testei o cenário grave — PR de fork alcançar o runner privilegiado — e está
**bloqueado**:

- Os dois jobs `self-hosted` (`build-image` e `deploy`) exigem
  `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`
  (`ci.yml:374, 609`).
- Todos os secrets (`VPS_SSH_KEY`, `GHCR_PULL_TOKEN`, `SENTRY_AUTH_TOKEN`) são
  usados **apenas** dentro desses jobs (linhas 439, 625, 630).
- PRs rodam só em `ubuntu-latest`, sem acesso a secret nenhum.

**Ponto de atenção (P3):** as GitHub Actions estão pinadas por tag mutável
(`@v4`, `@v3`), não por SHA — **0 de 12** pinadas por commit. São todas oficiais
(`actions/*`, `docker/*`, `pnpm/*`), então o risco é baixo, mas um
comprometimento de tag upstream atingiria o runner que tem a chave SSH da VPS.

---

## Decisões a preservar

1. **Separação de runners** (`ci.yml:1-20`): testes em `ubuntu-latest`
   (paralelos, auto-recuperam), self-hosted **só** para build+deploy. O comentário
   documenta o incidente que motivou: um runner único travado parava PRs por 45min.
2. **`driver: docker` no buildx** — mantém o cache no daemon da VPS. Está correto
   no CI; o ADR explica por que não "otimizar" de volta para `docker-container`.
3. **Deploy serializado** com `cancel-in-progress: false` e group fixo — dois
   merges próximos não disputam `git reset --hard` + `migrate deploy`.
4. **Limpeza assíncrona de imagens no deploy** (`ci.yml:694`), com `until=24h`
   para não apagar a imagem de rollback.
5. **`paths-ignore` para docs** — mudança só de markdown não gasta CI.

---

## Riscos estruturais (característica, não bug)

**VPS única = SPOF total.** App, banco, cache, storage, carteira, Chatwoot,
Evolution e o próprio runner de CI vivem na mesma máquina. Se ela cair: sistema
fora, e **a capacidade de fazer deploy também** (o runner morre junto).

Não recomendo mexer agora — é a decisão certa para a escala atual, e o custo de
distribuir seria desproporcional. Mas para comercializar, é o número que muda a
conversa quando o primeiro cliente perguntar sobre SLA.

O agravante real não é o SPOF: é que **o backup do banco fica na mesma máquina**
(a metade 2 — cópia off-site — segue pendente do dono desde 29/07) e **a carteira
não tem backup nenhum** (P0 da Etapa 3).

---

## Áreas de baixa confiança

- **Não testei restaurar o Esplora self-hosted** nem estimei o tempo de reindex.
- **`MONITOR_ENABLED=false`** no LWK ("Monitor de depósitos DESABILITADO — fase
  1"). Não determinei se é decisão deliberada (os depósitos chegam por webhook e
  há cron de reconciliação) ou resíduo. Não achei referência no repositório —
  vive no serviço LWK, que é externo. **Pergunta para o dono.**
- **Não medi custo em R$.** VPS de preço fixo, sem cloud elástica — FinOps não se
  aplica no formato usual.
- **Não auditei a configuração do Cloudflare** (WAF, rate limit de borda, regras
  de cache). Fica em aberto.
- **Não testei o `DOCKER-USER` chain** contra o UFW (herdado da Etapa 3).
- **Não validei se `pnpm audit` cobre o lockfile de produção** — o build usa
  `--frozen-lockfile`, então as versões auditadas devem ser as mesmas do runtime,
  mas não confirmei comparando a imagem final.
