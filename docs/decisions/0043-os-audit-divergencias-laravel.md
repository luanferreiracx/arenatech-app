# ADR 0043 — Divergências e bloqueios do módulo OS vs. Laravel

> Status: Accepted
> Data: 2026-05-18
> Contexto: Auditoria do módulo de Ordens de Servico antes da migracao de dados do Laravel.

## Contexto

O módulo OS do Next.js foi auditado contra `OrdemServicoController` (3.052 linhas) +
`OrdemServicoOrcamentoController` + `OrdemServicoPdfController` do Laravel. Esta ADR
registra as decisões tomadas para fechar gaps identificados antes da migracao de dados.

## Decisões

### D1 — Checklist com nomes do Laravel (15 itens)

A versao anterior do `checklistSchema` (display, touchscreen, battery, charging, wifi,
bluetooth, camera, speaker, microphone, buttons, biometrics, faceId, gps, cellular,
sensors) era uma reinvencao que **nao mapeava** para as colunas `check_entrada_*` /
`check_saida_*` do Laravel. Adotamos nomes equivalentes 1:1:

| Laravel column                      | NextJs key            |
|-------------------------------------|-----------------------|
| check_entrada_aparelho_liga         | aparelhoLiga          |
| check_entrada_aparelho_vibra        | aparelhoVibra         |
| check_entrada_botoes_ok             | botoes                |
| check_entrada_bluetooth_ok          | bluetooth             |
| check_entrada_wifi_ok               | wifi                  |
| check_entrada_vidro_traseiro_ok     | vidroTraseiro         |
| check_entrada_audio_ok              | audio                 |
| check_entrada_microfone_ok          | microfone             |
| check_entrada_cameras_flash_ok      | camerasFlash          |
| check_entrada_touch_faceid_ok       | touchFaceId           |
| check_entrada_aparelho_carrega      | aparelhoCarrega       |
| check_entrada_tela_frontal_ok       | telaFrontal           |
| check_entrada_carregamento_cabo     | carregamentoCabo      |
| check_entrada_carregamento_inducao  | carregamentoInducao   |
| check_entrada_ima_magsafe           | imaMagsafe            |

`true` = OK; `false` = NOK; `null` = N/A.

**Consequencias:**
- Migracao de dados Laravel → Next.js fica trivial (cada coluna vira chave do JSONB).
- Wizard (`step-problem.tsx`), edit (`[id]/edit/page.tsx`) e detalhe (`service-order-detail.tsx`)
  herdam labels automaticamente via `CHECKLIST_ITEMS` (constante unica).
- Os 3 campos do desenho anterior (gps, cellular, sensors) sao perdidos. **Aceitavel**
  porque nao existiam no Laravel — sem dados existentes para preservar.

### D2 — Status enum mantem `WAITING_APPROVAL` adicional

Laravel tem 12 status. NextJs tem 13 (adicionou `WAITING_APPROVAL`). Mantemos os 13:

- `WAITING_APPROVAL` cobre o cenario em que ha um orcamento aguardando aprovacao do
  cliente. No Laravel, essa logica e modelada via flag `orcamento_aguardando_aprovacao`
  + status `em_diagnostico`. Termos um status dedicado deixa o ALLOWED_TRANSITIONS
  mais legivel.

**Migracao de dados:** linhas Laravel em `em_diagnostico` que tenham
`orcamento_aguardando_aprovacao=true` viram `WAITING_APPROVAL`. Demais, `IN_DIAGNOSIS`.

### D3 — `updateStatus` bloqueia transicoes para PAID e DELIVERED

Paridade com Laravel. Excecoes:
- OS sem valor (totalAmount <= 0) ou de garantia podem pular fluxo PDV/termo.
- Admin (`isSuperAdmin`) com `force: true` pode bypassar.

Casos cobertos:
- `PAID` so via `registerPayment` (que registra caixa + financeiro).
- `DELIVERED` requer `deliveryTermSigned` ou `deliveryTermPhysical`.

### D4 — `registerPayment` exige caixa aberto

Paridade com Laravel. Excecoes idem D3 (garantia/sem valor; admin com `force`).

Comportamento anterior: se nao houver `CashSession` aberta, simplesmente pulava o
`cashMovement` silenciosamente. Agora lanca `BAD_REQUEST` direcionando o usuario para
abrir o caixa.

### D5 — Limpeza de `returnTerm*` ao retomar OS

Se a OS tinha `returnTermSent=true && returnTermSigned=false` (em processo de
cancelamento) e o usuario muda o status para qualquer estado que **nao seja**
`CANCELLED`, limpamos `returnTermSent`, `returnTermSentAt`, `returnTermAutentiqueId`,
`returnTermLink`. Paridade com Laravel.

### D6 — Delete bloqueia OS com garantias vinculadas

Se ha OS com `originalOrderId === id`, o `delete` rejeita com mensagem listando os
numeros das OS dependentes. Paridade com Laravel `destroy()`.

### D7 — `registerPayment` aceita `rewardActionId`

Paridade com Laravel `updateStatus → status=paga` aceitando `recompensa_id`. Logica:

1. Carrega `RewardAction` por id.
2. Valida: existe, pertence ao mesmo customer, status `APPROVED`, nao expirada.
3. Calcula desconto: `max(totalAmount * percentage / 100, value)`.
4. Marca `RewardAction.status = USED`, `usedAt = now()`, `usedInOsId = order.id`.
5. Acrescenta o desconto a `paymentDiscount` e nota descritiva em `paymentNotes`.

**Novo campo no schema:** `RewardAction.usedInOsId` (`used_in_os_id` na tabela). Antes
existia so `usedInSaleId`. Migration `20260518040000_add_used_in_os_id_to_reward_action`.

### D8 — `updateStatus → COMPLETED` dispara WhatsApp opcional

Se `notifyWhatsapp=true` for fornecido no input, envia mensagem via `sendTextMessage`
para o telefone informado (ou o do customer). E **best-effort**: falha de WhatsApp
nao bloqueia a transicao de status. Paridade com Laravel `enviarNotificacaoConclusaoWhatsApp`.

## Impacto na migracao de dados

Cada coluna `check_entrada_*` / `check_saida_*` mapeia direto para a chave correspondente
do JSONB. Status `em_diagnostico` com `orcamento_aguardando_aprovacao=true` vira
`WAITING_APPROVAL`. Demais status seguem mapeamento 1:1 listado abaixo:

| Laravel              | Next.js               |
|----------------------|-----------------------|
| iniciada             | OPEN                  |
| em_diagnostico       | IN_DIAGNOSIS / WAITING_APPROVAL |
| aprovada             | APPROVED              |
| aguardando_pecas     | WAITING_PARTS         |
| em_execucao          | IN_PROGRESS           |
| concluida            | COMPLETED             |
| paga                 | PAID                  |
| aguardando_retirada  | READY_FOR_PICKUP      |
| entregue             | DELIVERED             |
| em_garantia          | IN_WARRANTY           |
| cancelada            | CANCELLED             |
| estornada            | REFUNDED              |

## Referencias

- `docs/specs/ordens-servico/AUDIT_REPORT.md` — diagnostico completo da auditoria
- `src/lib/validators/service-order.ts` — schemas Zod
- `src/server/api/routers/service-order.ts` — procedures tRPC
- `prisma/migrations/20260518040000_add_used_in_os_id_to_reward_action/` — migration
