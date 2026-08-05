# Etapa 3 — Auditoria de Segurança e Resiliência

> Programa de comercialização, etapa 3 de 6. Skill `audit-security`, protocolo de
> 4 rodadas. Data: 2026-08-05.
>
> **Diferencial:** esta etapa foi validada **contra produção rodando** — testes
> HTTP reais nas fronteiras, port scan externo, verificação de firewall, e um
> **drill de restauração de backup** de ponta a ponta.

## Drill de recuperação de desastre — EXECUTADO

Este é o item que o próprio doc de backup chama de inegociável: *"Backup que
nunca foi restaurado não é backup."*

| Passo | Resultado |
|---|---|
| `gzip -t` no dump automático de 05/08 | OK |
| Dump completo (termina com `\unrestrict`) | OK — não truncado |
| Restauração em banco limpo | **0 erros** |
| Contagens vs. produção | idênticas: 2571 vendas, 2222 parcelas, 1766 pagamentos, 347 caixas, 7 tenants |
| RLS após restauração | 111 tabelas ativas |
| Integridade financeira | 0 divergências |
| App consegue operar | ❌ `permission denied` até reaplicar GRANTs → ✅ após reaplicar |

O passo dos GRANTs **já estava documentado** (`docs/operations/backup.md:121-123`)
— o drill confirmou que a documentação está correta e completa. Registrado na
tabela de verificação trimestral do doc.

**Backups:** diários às 02:30, 6 dumps retidos, permissão `600`, ~13 MB.

---

## Testes executados contra produção

| Teste | Resultado |
|---|---|
| `/admin/tenants` sem sessão | 301 → `/login?callbackUrl=...` ✅ |
| tRPC autenticado sem cookie | **401 JSON** (não HTML — lição do incidente de proxy aprendida) ✅ |
| `/api/cron/*` POST sem secret | 401 ✅ |
| `/api/cron/*` com secret errado | 401 ✅ |
| Partner API sem Bearer | 401 ✅ |
| Partner API com key falsa | 401 ✅ |
| `/api/whatsapp-media/...` token inválido | 403 ✅ |
| Path traversal em `/api/storage` | bloqueado ✅ |
| **Enumeração de usuário** (CPF que existe vs. não existe) | 200/200, **0,509s vs 0,502s** — indistinguível ✅ |
| **Rate limit** de `forgotPassword` (documentado 3/15min) | 200, 200, **429**, 429, 429, 429 ✅ |
| Redis 6380 de fora | bloqueado ✅ |
| MinIO 9000/9001 de fora | bloqueado ✅ |
| Carteira LWK (porta 5000) | **não mapeada para o host** ✅ |
| UFW | default deny; só 22/80/443 + portas de e-mail ✅ |
| SSH | só chave, `PermitRootLogin prohibit-password`, fail2ban ativo ✅ |

Nada disso vinha de leitura de código: são respostas do sistema em produção.

---

## Achados

### S1 — HSTS ausente no domínio principal (`pdvdepix.app`)

**Prova:**

| domínio | HSTS |
|---|---|
| `app.arenatechpi.com.br` | ✅ `max-age=31536000; includeSubDomains` |
| `pdvcripto.app` | ✅ |
| `catalogo.arenatechpi.com.br` | ✅ |
| **`pdvdepix.app`** | ❌ **ausente** |
| **`wildcard.pdvdepix.app`** | ❌ **ausente** |

`pdvdepix.app` é o domínio **para onde `app.arenatechpi.com.br` redireciona** —
é onde os clientes fazem login e movimentam a carteira DePix. O endurecimento foi
aplicado em 3 dos 5 vhosts e esqueceu justamente o principal.

É a oitava ocorrência do padrão que este projeto já nomeou: **duas
implementações da mesma regra, o endurecimento numa e os usuários na outra.**

**Impacto:** sem HSTS, o primeiro acesso de cada navegador é interceptável (SSL
stripping) numa rede hostil. HTTP→HTTPS redireciona (301), mas o redirect é o que
o atacante sequestra.

**Correção:** 1 linha em `/etc/nginx/sites-enabled/pdvdepix.app.conf` e no
wildcard. **Severidade P1**, custo baixíssimo.

O resto dos headers está excelente: CSP restritiva com allowlist explícito,
`frame-ancestors 'none'`, `object-src 'none'`, X-Frame-Options DENY, nosniff,
referrer-policy, permissions-policy.

---

### S2 — App sem healthcheck e `/api/health` que não existe

Dois fatos que se compõem:

1. **`/api/health` está na allowlist de rotas públicas**
   (`src/lib/auth/public-routes.ts:75`) mas **a rota nunca foi criada** —
   `src/app/api/health/` não existe. Em produção devolve **404 com HTML**.
2. **O container do app não tem healthcheck** (`Healthcheck: NAO`), ao contrário
   de Postgres e LWK, que têm.
3. **Nenhum monitoramento externo** bate no endpoint (0 hits em 24h de log).

Consequência: o app que serve todos os clientes não é monitorado por ninguém. Se
travar em estado zumbi (processo vivo, requisições penduradas), `unless-stopped`
não reinicia — restart policy só age em processo morto.

Hoje: container de pé há 4h, **0 restarts**. Não há incidente. Mas para
comercializar, "descobrimos porque um cliente reclamou" não é estratégia de
detecção.

**Severidade: P1 operacional.**

---

### S3 — IDOR cross-tenant em `subscriptionChargeStatus`

`src/server/api/routers/settings.ts:1271-1289`:

```ts
subscriptionChargeStatus: tenantAdminProcedure
  .input(z.object({ transactionId: z.string().uuid() }))
  .query(async ({ input }) => {          // ctx NÃO é destructurado
    const row = await withAdmin((tx) =>  // BYPASSRLS
      tx.tenantDepixTransaction.findUnique({
        where: { id: input.transactionId },  // sem filtro de tenantId
```

Três condições combinadas: `withAdmin` desliga o RLS, o `findUnique` não filtra
por tenant, e o `ctx` sequer é destructurado — o `tenantId` está
*estruturalmente indisponível* para filtrar.

Admin do tenant A lê `{status, paid, expiresAt}` de uma cobrança do tenant B.

**Prova de dado:** **0 cobranças de assinatura em produção**
(`source_type='SUBSCRIPTION'`). O buraco existe, mas não há dado para vazar hoje.
Passará a importar quando o billing automático entrar (ADR 0058).

**Severidade: P2 latente.** Reforça que é lapso e não decisão: os outros ~20 usos
de `withAdmin` em routers de tenant filtram por `ctx.tenantId` corretamente,
inclusive os 5 vizinhos no mesmo arquivo (`settings.ts:977-1027`).

---

### S4 — `recalculateSale` com assinatura que convida ao erro

`src/server/api/routers/sale.ts:4708-4713` — o parâmetro `tx` é tipado como
cliente de `withAdmin` (BYPASSRLS) e a função recebe `_tenantId` que **ignora**,
fazendo `findUnique` sem filtro de tenant.

**Não é explorável:** verifiquei os 13 call sites — todos rodam dentro de
`ctx.withTenant(...)` e repassam o `tx` RLS-scoped. O RLS bloqueia.

O risco é futuro: a assinatura *anuncia* que aceita um cliente BYPASSRLS. O dia
em que alguém a chamar de um contexto `withAdmin` — que é o que o tipo convida a
fazer — vira IDOR de escrita em vendas. O `_tenantId` já é passado por todos os
13 chamadores e ninguém usa.

**Severidade: P2 (latente estrutural).**

---

### S5 — Reset de senha/2FA com efeito cross-tenant

`tenant-user.service.ts:305, 326` — `resetTenantUserPasswordInTx` e
`resetTenantUserTwoFactorInTx` fazem `tx.user.update` na tabela **global** de
usuários.

Se um usuário pertence aos tenants A e B, o admin de A reseta a senha/2FA dele e
**afeta o login em B também** — inclusive derrubando o 2FA, que é pré-requisito
de saque DePix.

`loadMembership` garante que a vítima é membro de A (não é acesso arbitrário), e
senha global é decisão de design documentada. Mas o admin de A consegue **negar
serviço** ao usuário no tenant B.

**Severidade: P2 (limite do modelo de identidade global).** Documentar como
comportamento conhecido é aceitável; deixar implícito não é.

---

### S7 — A carteira de cripto não tem backup automatizado (P0)

**O achado mais grave desta etapa.** O backup diário cobre o **banco**. A
**carteira LWK não é coberta por nada.**

**Prova:** não existe timer systemd nem script de backup da carteira
(`systemctl list-timers | grep -i lwk` → 0; `/usr/local/bin/` só tem
`arenatech-backup-db.sh`). O único backup é um tar **manual de 15/06**.

**O que mudou desde então** (volume `lwk-wallet_lwk_wallet_data`, 121 MB,
modificado hoje às 08:56):

| diretório | no backup de 15/06? |
|---|---|
| `dd308431-...` (arena-tech) | ✅ sim |
| `946d2ab3-...`, `c4116016-...` | ✅ sim |
| **`0b54167e-...`** | ❌ **não existe no backup** |
| **`6d4835e9-...`** | ❌ **não existe no backup** |
| **`4e12cee5-...`** | ❌ **não existe no backup** |

Três carteiras criadas depois de 15/06 (28/07 e 04/08) estão **sem nenhum ponto
de restauração**. Cada uma contém `descriptor.txt` — o que permite reconstruir a
carteira — e `idempotency.json`, que a memória do projeto identifica como a
**fonte de verdade para saber se um saque saiu** (foi o que resolveu o incidente
de pagamento duplicado TXW20260727-00002).

**Blast radius:** perda do volume = perda dos descriptors das carteiras
non-custodial criadas após 15/06, e perda da única evidência confiável de quais
saques foram transmitidos. É a mesma classe do achado P0-INFRA-1 de 29/07
(*"produção não tinha backup de banco"*) — resolvido para o banco e **não
propagado para a carteira**, que é onde mora o dinheiro.

**Severidade: P0.** Custo de correção baixo (um timer systemd espelhando o
`arenatech-backup-db.sh`); custo de não corrigir é irrecuperável.

Nota: o volume também guarda diretórios `.compromised-*` (15/06) e `.deleted-*`
(28/07), evidência de que incidentes de carteira já aconteceram — mais uma razão
para o histórico ser preservado.

---

### S6 — Higiene: `impersonatedTenantId` morto

4 ocorrências no repositório. Única escrita é `token.impersonatedTenantId = null`
(`auth.ts:423`). Nenhuma decisão de autorização o lê. Feature abandonada.

**Severidade: P3.** Remover, ou o próximo leitor vai supor que impersonation
existe e é segura.

---

## Vetores de ataque testados e BLOQUEADOS

Documentar o que **não** é vulnerável importa tanto quanto o que é.

| Vetor | Guarda que bloqueia |
|---|---|
| **Escalar a superadmin** | Nenhum caminho escreve `isSuperAdmin` a partir de input. Sem mass-assignment: os 28 `user.create/update` enumeram campos. `role` é `z.enum(["admin","operator"])`. Superadmin é intocável pela gestão de equipe (`tenant-user.service.ts:81,117`) |
| **Escapar do tenant** | `input.tenantId` só existe em `adminProcedure`. Cookie de tenant é validado contra `availableTenants`. **Header `x-tenant-id` forjado**: o proxy deixa passar, mas `tenantProcedure` revalida com `hasTenantAccess` → FORBIDDEN (`trpc.ts:73`) |
| **IDOR generalizado** | RLS `ENABLE` + **`FORCE`** em todas as tabelas com `tenantId` exceto `user_tenants` (global por natureza) — e as 13 queries a ela filtram por `ctx.tenantId` |
| **Criar role acima do seu** | Teto do enum é `admin`, o próprio nível do atacante |
| **Bypass de 2FA** | Counter TOTP monotônico com CAS atômico no banco; backup codes com `array_remove` atômico; sem 2FA o saque é **bloqueado**, não liberado (fail-closed) |
| **Trocar o 2FA por um seu** | `startEnrollment` exige código atual válido; desativar exige 4 fatores |
| **Impersonation** | Campo morto, nunca escrito com valor |
| **Tomada de conta via reset** | Token `randomUUID()` hasheado em SHA-256, TTL 1h, uso único, anteriores invalidados, entregue só por e-mail, 3/15min por IP |
| **Sessão sobrevive ao reset de senha** | `passwordFingerprint` no JWT: refresh compara e mata a sessão se divergir (`auth.ts:56-58, 430-435`) |

---

## Decisões a preservar

1. **`hasTenantAccess` na borda tRPC** (`trpc.ts:73`) duplica a checagem do proxy
   de propósito — é o que transforma `x-tenant-id` de autoridade em sugestão.
2. **Fail-closed com teto de graça no refresh do JWT** (`auth.ts:487-497`): erro
   de banco mantém o token (não derruba todo mundo num blip da infra), mas só até
   ficar stale. Limita a janela de um usuário revogado reter acesso.
3. **Anti-replay de 2FA por compare-and-set no banco**, não em memória. O
   comentário registra que a versão anterior (read-then-write) era replayable.
4. **DSN do Sentry versionado como default** (`sentry.server.config.ts:4-5`),
   com a justificativa correta: DSN só envia, nunca lê.
5. **Rate limit com política de degradação explícita** (`rate-limit.ts:47-62`):
   fail-closed onde importa (Partner API), fail-open consciente onde a auth ainda
   protege.
6. **LWK não exposto ao host** — a carteira, maior blast radius do sistema, só é
   alcançável pela rede interna do Docker.

---

## Correções ao meu próprio trabalho nesta etapa

Registro porque o método importa mais que o placar:

1. **Reportei que `docs/operations/backup.md` não existia.** Errado — meu shell
   estava em `/tmp`, resquício do download do backup. O documento existe, é bom,
   e já registra o problema dos GRANTs que o drill encontrou. Achado retirado.
2. **Ia reportar `minioadmin` como credencial ativa em produção.** As variáveis
   `S3_ACCESS_KEY`/`S3_SECRET_KEY` **estão definidas** no container. O default
   hardcoded é risco de *dev*, não de prod — rebaixado a P3.
3. **Ia reportar Sentry desligado** por não achar `SENTRY_DSN` no ambiente. O DSN
   é versionado como default por decisão documentada. Retirado.

---

## Áreas de baixa confiança

- **Não confirmei que eventos chegam ao Sentry.** Com 0 erros em 24h não houve
  evento para observar. Não afirmo que funciona nem que não funciona.
- **Não testei o UFW contra a cadeia `DOCKER-USER`.** Docker costuma inserir
  regras que contornam o UFW; o teste externo mostrou Redis e MinIO bloqueados,
  então na prática está fechado — mas não auditei as regras de iptables.
- **Não fiz teste de carga nem simulação de DDoS.**
- **Não auditei a supply chain** (dependências, `pnpm audit`, integridade de
  lockfile). Fica para a Etapa 4 (infra/CI-CD).
- **Não testei restaurar o backup da carteira LWK** (o de 15/06). Confirmei que
  ele não contém 3 das carteiras atuais (ver S7), mas não validei se o que ele
  contém ainda restaura.
- **Disco da VPS em 81%** (78G de 96G). Não investiguei o crescimento nem quanto
  tempo resta. Fica para a Etapa 4.
