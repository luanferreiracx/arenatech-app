# ADR 0064 — O plano é escolhido no cadastro, não atribuído depois

- **Status:** Aceito
- **Data:** 2026-08-03
- **Contexto:** [ADR 0061](0061-comercializacao-self-service.md) (comercialização self-service), [ADR 0063](0063-catalogo-de-planos.md) (catálogo de planos), [ADR 0050](0050-tenant-no-kyc-onboarding.md) (onboarding NO-KYC)

## Contexto

O ADR 0061 decidiu que a venda é **self-service**: o cliente escolhe o plano e
paga sozinho, sem vendedor no meio. O ADR 0063 definiu os quatro planos. Faltava
a peça que liga uma coisa à outra — o funil: página de preços pública, escolha do
plano no cadastro, e o teste grátis começando no plano escolhido.

Ao construir essa peça, uma regra do onboarding entrou em conflito direto com ela.

O ADR 0050 (venda assistida) estabeleceu que **todo tenant nasce só com a
Carteira DePix**, e o superadmin atribui o plano definitivo depois, à mão. Isso
está no código como `resolveWalletOnlyActivePlanId`, que **rejeita** qualquer
plano com módulos no `createTenant` e no `approvePreRegistration`:

```
"Onboarding inicial permite apenas planos com Carteira DePix"
```

Sob venda assistida a regra fazia sentido: não havia como o cliente escolher, e
"nasce sem plano" evitava liberar módulo por engano. Sob self-service ela é
exatamente ao contrário do que se quer: a aprovação **rejeitaria a escolha que o
cliente acabou de fazer** na página de preços.

Havia ainda uma segunda regra tornada obsoleta pelo ADR 0062: com
`wallet`/`depix-ops` virando piso condicionado a `Tenant.depixEnabled`, um plano
"wallet-only" passou a ser um plano com **nenhum** módulo de plano. A verificação
`modules.length === 1 && modules[0] === "wallet"` já não descrevia a realidade.

## Decisão

**1. O onboarding aceita qualquer plano ativo do catálogo.**
`resolveWalletOnlyActivePlanId` vira `resolveOnboardingPlan`, que devolve o plano
e se ele vende módulos. Sem plano continua sendo um estado válido: quem chega
direto em `/register` se cadastra e escolhe depois.

**2. Aprovar um cadastro com plano ABRE a assinatura em `TRIALING`.**
Antes, atribuir o plano ao tenant liberava os módulos via `Tenant.plan` **sem
criar Subscription**. Isso seria acesso liberado que nunca vence, nunca cobra e
não aparece em nenhuma métrica de receita. Plano sem módulo de plano (só carteira)
não abre assinatura: não há o que cobrar nem o que expirar.

**3. A abertura de assinatura tem UMA implementação.**
`startSubscription` (`server/services/subscription-start.service.ts`) é usada por
`activateSubscription`, `approvePreRegistration` e `createTenant`. O projeto já
pagou sete vezes pelo padrão "duas implementações da mesma regra, endurecidas em
tempos diferentes"; um trial que começa com 7 dias por um caminho e 0 por outro
só apareceria quando o cliente fosse bloqueado no dia seguinte ao cadastro.

**4. O plano viaja por SLUG, nunca por id.**
A escolha chega em `/register?plano=<slug>` e o servidor resolve contra o
catálogo. Aceitar um id do cliente deixaria o visitante apontar para qualquer
linha de `plans` — inclusive `free` (R$ 0), que segue ATIVO porque um tenant
aponta pra ele. Slug fora do catálogo, inexistente ou inativo vira "sem plano",
**sem erro**: a pessoa está no meio do cadastro e um parâmetro torto de URL não
pode custar a conta dela.

**5. A vitrine mostra só o catálogo, e os benefícios são texto de venda.**
`publicPlans` filtra por `CATALOG_SLUGS` — planos legados não estão à venda. Os
benefícios exibidos vêm de `highlights` no catálogo, escritos à mão, **não
derivados de `features.modules`**: a lista de módulos é a intenção de gating, que
o endpoint público esconde por construção (P2 da auditoria 2026-07-14). Derivar a
vitrine dela reabriria o vazamento pela porta da frente. Efeito colateral bom: o
cliente lê "controle de caixa", não `cashier`.

**6. `pre_registrations.plan_id` ganha FK com `ON DELETE SET NULL`.**
A coluna existia mas ninguém escrevia — era um uuid solto. Agora que o funil
escreve nela, um plano removido deixaria pré-cadastros apontando para o nada e a
aprovação morreria com "plano não existe" sem dizer de onde veio o id. `SET NULL`
e não `RESTRICT` porque um cadastro pendente não pode travar a gestão de planos do
superadmin: ele volta a "sem plano", estado que a aprovação já trata.

## Consequências

**Boas**
- Existe um caminho completo do visitante anônimo ao tenant testando: `/planos` →
  `/register?plano=` → verificação → aprovação → `TRIALING`.
- A promessa da vitrine e o prazo aplicado vêm da mesma fonte
  (`publicTrialDays` lê o mesmo `PlatformSettings` que a aprovação usa). Mudar o
  padrão no painel muda a vitrine junto.
- O superadmin passa a **ver** o plano escolhido na tela de aprovação. Antes
  aprovava sem saber o que o cliente tinha contratado.
- `createTenant` (caminho manual) segue a mesma regra: plano com módulos nasce em
  teste. Os dois caminhos concordam.

**Custos e riscos**
- A aprovação deixou de ser uma operação puramente administrativa: ela agora
  **inicia a contagem do teste**. Se um cadastro ficar dias na fila, o cliente não
  perde dias de teste (a contagem começa na aprovação, não no cadastro) — mas o
  superadmin precisa saber que aprovar é um ato comercial. A tela diz isso.
- `free` e `pro` continuam ATIVOS no banco. São invisíveis na vitrine e
  inalcançáveis por URL, mas ainda podem ser atribuídos pelo painel. Inativá-los
  exige mover o tenant `demo-paybis` primeiro — fica para depois, deliberadamente.

## Alternativas descartadas

- **Manter o tenant nascendo wallet-only e cobrar o plano na primeira entrada.**
  Adiciona um passo entre "quero testar" e "estou testando", que é exatamente
  onde funis vazam. E deixaria duas telas disputando a escolha do plano.
- **Derivar os benefícios da vitrine de `features.modules`.** Mais barato de
  manter e reabre um vazamento que já foi achado em auditoria. Além disso a chave
  do gate não é linguagem de cliente.
- **Aceitar o plano por id na URL.** Simplificaria a resolução no servidor e
  entregaria a tabela `plans` inteira ao visitante, `free` (R$ 0) incluso.

## Verificação

- `__tests__/integration/funil-self-service.test.ts` — 11 casos contra os routers
  e o banco de verdade: o plano sobrevive de `?plano=` até `Subscription.planId`,
  a aprovação abre `TRIALING` com vencimento no fim do teste, slug legado/inválido
  degrada para "sem plano", e sem plano não se cria assinatura.
- `__tests__/e2e/funil-planos.spec.ts` — 3 `@smoke` (a vitrine responde sem
  cookie, não vaza gating, e o plano chega ao cadastro) + 3 `@business`.
- `__tests__/unit/plan-catalog.test.ts` — guardas da vitrine: todo plano tem
  benefício, benefício nunca é chave de módulo, e o limite de equipe anunciado
  bate com o `maxUsers` cobrado.
