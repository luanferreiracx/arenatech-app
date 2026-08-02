# ADR 0061 — Comercialização self-service: trial, checkout, cobrança e bloqueio suave

## Status

Aceito — 2026-08-02. Substitui a fase manual do ADR 0058 sem revogá-la (o caminho
manual do superadmin continua como fallback).

## Contexto

O sistema tem a máquina de billing inteira montada e nunca faturou um ciclo.
Medição em produção, 2026-08-02:

| Fato | Valor |
|---|---|
| Tenants | 7, todos de teste ou infraestrutura |
| Assinaturas | 1 (conta de demonstração) |
| Cobranças DePix de assinatura (ADR 0058) | 0 |
| Linhas de `audit_logs` com ação `subscription.*` | 0 de 141 |
| Addons, compras de addon, reembolsos | 0, 0, 0 |

Quatro defeitos bloqueiam a venda.

**1. Quem atrasa é expulso e não consegue voltar.** A assinatura vence, o cron
espera a carência de 5 dias e marca `Tenant.status = SUSPENDED`. No login
seguinte o JWT só monta tenants `ACTIVE`, `availableTenants` fica vazio e o proxy
redireciona para `/no-access`, que diz "Sua conta ainda não está vinculada a
nenhuma loja" e oferece um botão Sair. A tela com o botão "Pagar assinatura" é
rota de tenant, inalcançável sem tenant ativo. O cliente fica trancado do lado de
fora, lê uma mensagem que descreve outro problema e depende do superadmin para
voltar.

**2. Nenhum aviso de cobrança existe.** Não há e-mail nem WhatsApp em ponto algum
do funil de billing. `runSubscriptionExpiry` devolve `suspendedTenantIds` e o
route handler descarta a lista. O cliente descobre a suspensão quando tenta
trabalhar.

**3. `currentPeriodEnd` nulo torna a assinatura imortal.** O cron filtra por
`currentPeriodEnd < now`, e NULL nunca casa com essa comparação. A única
assinatura de produção está exatamente nesse estado: nunca vence, nunca vira
`PAST_DUE`, nunca suspende. Ela também não tem `subscription.activate` no audit
log, o que mostra que não veio pelo código: foi inserida à mão e caiu num estado
que o motor de cobrança não enxerga.

**4. Não existe funil de compra.** O cadastro não pede plano, a tela de assinatura
manda falar com o suporte e `admin.publicPlans` não é consumido por nenhuma tela.
Toda venda depende do superadmin ativar manualmente.

## Decisão

### Carteira DePix e API de parceiros saem da matriz de plano

`wallet` e `depix-ops` passam a `ALWAYS_ON_MODULES`, ao lado de `settings`. A
carteira guarda o dinheiro do cliente. Nenhuma decisão comercial nossa pode
separá-lo dele, nem quando ele deve.

`partner-api` já não dependia de plano. Continua sob o override por tenant
`apiAccessEnabled` do ADR 0057, que é controle de segurança e não de pacote.

Consequência direta: o plano FREE atual, que libera exatamente `wallet`, vira
redundante. A escada comercial passa a ter três degraus, e o degrau de entrada
não é um plano: é o piso que todo tenant tem.

### O bloqueio por inadimplência vira suave

Suspender deixa de significar expulsar. O tenant `SUSPENDED` mantém a sessão e o
acesso ao piso sempre-ligado (carteira, link de cobrança, API, configurações). Os
módulos pagos ficam bloqueados, e a tela de bloqueio explica o motivo e mostra o
QR de pagamento.

Isso desfaz o beco sem saída: o caminho de volta passa a existir dentro do
produto, sem intervenção humana.

### `currentPeriodEnd` vira obrigatório

Migração em expand-contract: preencher a linha órfã, depois aplicar `NOT NULL`.
Um vencimento nulo é invisível para o motor de cobrança, e o banco passa a
recusar esse estado em vez de escondê-lo.

### A cobrança avisa antes e depois

Três disparos por assinatura, em e-mail e WhatsApp, reusando `sendEmail` e
`sendTextWithFallback`:

1. três dias antes do vencimento;
2. no dia do vencimento, quando a assinatura vira `PAST_DUE`;
3. na véspera da suspensão, com o prazo explícito.

O cron passa a consumir `suspendedTenantIds`, que já devolve. Cada disparo é
idempotente por (assinatura, tipo de aviso, ciclo): reprocessar o cron não
bombardeia o cliente.

### Trial de 7 dias, com controle do superadmin

Novo estado `TRIALING` e campo `Subscription.trialEndsAt`. O prazo padrão é
global e editável no painel do superadmin; cada tenant aceita um override
("estender trial"). Trial expirado segue o mesmo caminho de vencimento:
`PAST_DUE`, carência, bloqueio suave.

### O cliente compra sozinho

O cadastro passa a pedir o plano. A página pública de preços consome
`admin.publicPlans`, que já existe. O upgrade acontece dentro do app, pelo QR
DePix do ADR 0058, e o webhook ativa o plano sem intervenção.

## Alternativas consideradas

**Manter a venda assistida e só consertar o beco.** Mais barato e resolve o
churn involuntário, mas mantém o teto de crescimento na agenda do superadmin.
Rejeitada por decisão do dono.

**Cortar saque DePix e API durante a carência.** Aumentaria a pressão de
pagamento. Rejeitada: o saldo é do cliente, e reter dinheiro alheio como
alavanca de cobrança é abuso, além de risco regulatório.

**Débito automático do saldo DePix do tenant.** Adiado. A carteira é
non-custodial (ADR 0051) e o servidor não tem a chave.

**Gateway de cartão com recorrência.** Adiado. O QR DePix já está integrado e
testado; adicionar um gateway agora multiplica a superfície de pagamento antes
do primeiro cliente pagante.

## Consequências

**Positivas.** O churn involuntário deixa de ser fabricado pelo produto. O
superadmin sai do caminho crítico da venda. A carteira DePix deixa de depender
de decisão comercial, o que também simplifica o gating.

**Negativas e a vigiar.** O bloqueio suave aumenta a superfície de gating: um
tenant suspenso navega pelo app com módulos reduzidos, e cada rota precisa
respeitar isso. O risco é liberar demais por engano, e o guardião é o
fail-closed que `isPathAllowed` já aplica.

Trial sem cartão convida abuso por cadastros repetidos. O limite de um
pré-cadastro pendente por e-mail ajuda, mas não impede e-mails descartáveis.
Monitorar antes de endurecer.

Os avisos de cobrança dependem da entrega de e-mail, que hoje só é confiável no
domínio `pdvdepix.app`. Nenhum aviso pode ser considerado entregue sem checar o
retorno de `sendEmail`.

**Fora de escopo.** Fiscal e NF-e continuam adiados (ADR do módulo 7, 0 notas
emitidas). Addons e reembolsos ficam de fora da escada até alguém decidir se
existem: 0 registros em produção.
