# Módulo 10 — Configurações / Equipe / Auth

**Passada A (backend):** concluída — parte 1 em 2026-07-29, parte 2 em 2026-07-30.
**Passada B (frontend):** concluída em 2026-07-30 (19 telas × 2 papéis × 2 viewports).

> **Antecipado** na fila (decisão do dono, 2026-07-29): três achados transversais
> vinham caindo neste módulo ao longo das passadas anteriores, e todos afetam os
> módulos que ainda faltam. Corrigir na raiz já tinha pago uma vez — as correções
> de primitivo dos Módulos 2–4 fizeram os Módulos 4, 5 e 6 chegarem quase limpos.

## Superfície

| | |
|---|---|
| Routers | `settings.ts` (1.463), `auth.ts` (260), `two-factor.ts` (343) |
| Borda | `src/proxy.ts` (252) — sessão, tenant ativo, gating de rota |
| Serviços | `password-policy.service.ts`, `backup-code.service.ts`, `two-factor-verify` |
| Telas | `/settings/*` (18), `(auth)/*` |

## Achados

### CFG-1 — havia uma política de bloqueio de conta que nada aplicava (P1)

`TenantSecuritySettings` guardava `maxFailedLoginAttempts` (default 5) e
`lockoutMinutes` (default 15). Os campos eram validados por Zod na procedure de
escrita e selecionados pelo serviço de política de senha.

**Nenhum código os consumia.** O bloqueio real do login é o rate-limit por IP
(`src/lib/utils/rate-limit.ts`), com valores **fixos** no código, e `users` não
tem coluna de tentativas falhas. Ou seja: dois campos que pareciam uma política
de bloqueio **de conta** e não eram nem configuráveis (a procedure de escrita não
tem tela) nem por conta.

É o que a skill de auditoria de segurança chama de **controle ilusório**: parece
proteção, cria confiança falsa, e no dia do incidente não está lá.

**Decisão do dono:** remover. Sem perda de dado — a tabela está **vazia em
produção** (0 linhas, medido em 2026-07-29): a política nunca foi configurada por
ninguém, porque não havia como.

> Bloqueio por conta de verdade, se um dia virar prioridade, é item próprio:
> exige coluna no usuário, contagem no login e cuidado no caminho mais sensível
> do sistema.

### CFG-2 — as rotas REST não tinham gating de plano (P1)

O gate por plano vivia **só na borda tRPC**. As **25 rotas REST autenticadas por
sessão** (PDFs, CSVs, uploads, SSE) ficavam sem nada: o proxy isenta `/api/*` de
propósito — um redirect 307 → HTML quebra o cliente JSON, incidente documentado —
e o `tenantProcedure` não passa por elas.

O efeito era concreto e verificável: um tenant **wallet-only** não conseguia
chamar `stock.*` pelo tRPC, mas **baixava o PDF de posição de estoque**, o CSV do
financeiro e o recibo do PDV pela rota REST equivalente. O plano virava
preferência de UI na metade REST do sistema.

Vale nomear a confusão que sustentava isso: `tenantProcedure` + RLS garantem
**isolamento** (o dado é do tenant certo), **não gating de plano**. São controles
diferentes, e o segundo não existia aqui.

**Correção estrutural, não por rota.** A decisão de "este tenant tem este
módulo?" foi extraída para `src/server/auth/module-gate.ts` e passou a ser
chamada pelos **dois** lados — a borda tRPC e as rotas REST. Escrever a regra
duas vezes seria repetir exatamente o padrão que este programa encontrou em três
módulos: duas implementações, o endurecimento numa e os usuários na outra.

Cobertura aplicada: 25 rotas, por módulo — `cashier` (1), `commissions` (3),
`financial` (1), `fiscal` (2), `pdv` (4 + SSE), `service-orders` (6),
`stock` (4), `depix-ops` (1 + SSE), `wallet` (1).

**Guardião**: `__tests__/unit/rest-module-gate.test.ts` varre `src/app/api`,
exige o gate em toda rota que lê sessão e obriga a **declarar o motivo** de cada
dispensa (cron por `CRON_SECRET`, webhook por HMAC, parceiro por API-key, mídia
por token assinado, catálogo público). Verificado a valer: criei uma rota nova sem
gate e o teste reprovou apontando o nome dela. Ele também falha se uma dispensa
apontar para rota que não existe mais — dispensa órfã esconde a próxima rota que
nascer com o mesmo nome.

**Prova de que o gate age**, não só existe: um caso em
`stock-report-uses-real-balance` chama a rota do PDF com sessão cujo plano não
traz `stock` e espera **403**.

### CFG-3 — o PDF do simulador não tinha autenticação nenhuma (P2)

`POST /api/simulator/pdf` era aberto: recebia valores no corpo e devolvia HTML
formatado. **Não lê banco e não expõe dado de tenant** (é um formatador puro, e o
conteúdo passa por `escapeHtml`), então não havia vazamento — mas era um gerador
de documento aberto na internet, sem sessão e sem limite. A tela que o usa é
autenticada; o endpoint passou a exigir o mesmo.

### CFG-4 — o formulário de Geral trocava input não-controlado por controlado (P3)

`/settings/general` emitia no console *"A component is changing an uncontrolled
input to be controlled"*. Causa: `useForm({ values: settings ? {…} : undefined })`
— sem `defaultValues`, os campos nascem sem valor e ganham um quando a query
resolve. Corrigido com `defaultValues` na forma vazia.

**Medido nos dois sentidos:** no código anterior o aviso aparece; com
`defaultValues`, não aparece.

**Uma afirmação minha que não sobreviveu à medição.** Eu tinha anotado que sair da
janela e voltar (com `refetchOnWindowFocus`, padrão do TanStack) **descartava a
digitação em curso**, e que isso valia para 9 formulários. Fui medir na cópia de
produção: digitei, troquei de aba, esperei passar o `staleTime` de 30s, voltei — o
texto **continuou lá**, com e sem a correção. O motivo é que o `values` do RHF
compara com o valor **anterior da própria prop**, não com o estado do formulário:
refetch que devolve o mesmo dado não dispara reset nenhum.

Mantive `resetOptions: { keepDirtyValues: true }` nos 9 formulários e passei a
descrevê-lo pelo que é — **cinto de segurança** para o caso real de outra pessoa
alterar a configuração enquanto a tela está aberta (aí o dado muda, o reset
acontece de verdade, e sem `keepDirtyValues` a digitação vai embora). Não é
correção de bug observado.

É a segunda vez neste programa que uma hipótese de frontend não sobrevive à
medição (a primeira foi o `ErrorBoundary`, no Módulo 5). As duas nasceram da mesma
forma: leitura de código convincente, sem sessão real. Voltei a marcar no doc o
que é medido e o que é suposto.

### CFG-5 — API de Parceiros mostrava vazio onde devia mostrar bloqueado (P2)

`/settings/partner-api` num tenant sem `apiAccessEnabled` mostrava "Nenhuma chave
emitida ainda" — estado **vazio**, não bloqueado — com botão "Nova chave" e o
formulário de webhook aparentemente funcionais. Ações que só podiam falhar, e o
único sinal era um toast que desaparece.

O corpo da tela passou a resolver por `keysQuery.isError` para o `QueryErrorState`
criado no Módulo 1, com título "API de Parceiros não habilitada para esta loja".

### CFG-6 — o operador via 15 abas de configuração que o backend recusa (P1)

O gating de aba tinha **uma dimensão só: módulo**. Papel não entrava na conta.
Resultado medido na cópia de produção, navegador real, comparando admin × operador
nas 19 telas: **as duas sessões abriam exatamente as mesmas 15 abas**, sem um único
403 nas leituras.

E as ações estavam lá, habilitadas:

| Tela | O que o operador via | O que acontecia |
|---|---|---|
| Regras de Venda | "Salvar" habilitado | preenche, clica, **403** "Apenas proprietários podem alterar configurações de recebimento" |
| Cartões e Recebimento | "Nova Adquirente", "Taxas" | abre o formulário inteiro de adquirente antes de descobrir |
| Formas de Pagamento | "Nova Forma", "Configurar" | idem — e forma de pagamento carrega **taxa**, que é dinheiro |
| Logs de Atividade | log de auditoria completo, com filtros | leitura de governança liberada |
| Assinatura | plano e cobrança da loja | idem |

**O backend está íntegro.** Varri as 26 mutations de `settings`, `receiving`,
`simulator` e `partnerApiKey` corpo por corpo: **todas** têm gate de admin, por
`tenantAdminProcedure` ou por `isTenantAdmin` inline. Só `changePassword`
(`protectedProcedure`, cada um troca a própria senha) e `simulator.sendWhatsApp`
(enviar simulação é trabalho de operação) ficam fora, corretamente.

> Registro de método: minha primeira leitura, feita por grep da procedure-base,
> apontou "7 writes de dinheiro sem gate de admin" — inclusive `updateReceiving`.
> Era **falso**: essas procedures checam admin no corpo. Grep de assinatura não
> substitui leitura do corpo, e eu quase escrevi um furo de autorização que não
> existe.

Então o achado não é autorização — é **falsa affordance**, na definição da skill de
auditoria de frontend: a tela oferece o que não entrega e o usuário só descobre
depois de trabalhar. E `/settings/users` já fazia certo (o botão "Novo usuario"
não aparece para o operador), o que dá a esse achado a forma recorrente deste
programa: **duas implementações, o endurecimento numa e os usuários na outra.**

**Prova de dados:** produção tem **2 contas de operador**, ambas no tenant
`arena-tech` — o que vende. Não é latente.

**Correção estrutural, uma declaração e três consumidores.**
`SETTINGS_OPERATOR_TABS` em `src/lib/modules.ts` lista **por exclusão** as abas que
o operador abre — aba nova nasce restrita ao admin, mesmo fail-closed de
`isPathAllowed`. `isAdminOnlySettingsPath` é consumida por:

1. **proxy** (passo 7c) — bloqueia a URL direta. Sumir do menu não é autorização.
2. **layout de settings** — filtra a barra de abas, junto do filtro de módulo.
3. **menu lateral** — `adminOnly` em Configurações Gerais, Formas de Pagamento e
   Taxas do Simulador (Entregadores fica: as procedures de entregador não exigem
   admin, é trabalho de operação).

O operador mantém **Segurança** (nunca gateada — 2FA é pré-requisito de saque
DePix) e **Entregadores**.

`user_tenants.role` é String livre e `isTenantAdmin` só reconhece `"admin"` — então
o gate barra igualmente `manager`, `technician` e `cashier`. Não é escolha nova: é
exatamente o que o backend já fazia. Produção só tem `admin` e `operator`.

Verificado no navegador depois da correção: operador redirecionado nas 15, com
aviso visível; admin abrindo todas normalmente; as duas abas abertas funcionando.

### CFG-7 — o aviso de acesso bloqueado nunca foi visto por ninguém (P2)

Achado que só apareceu porque eu precisei do mecanismo. Ao mandar o operador
barrado para `/painel?error=acesso-restrito`, reaproveitei o aviso que já existia
para o gating de plano — e ele **não aparecia**. Fui medir o de plano:
`/painel?error=modulo-indisponivel` **também não aparece**. Está em produção desde
o gating por plano, e nenhum usuário barrado jamais leu por que caiu no painel.

Diagnóstico, com instrumentação em vez de palpite (errei duas vezes o mecanismo
antes de medir):

1. O efeito **roda** — instrumentei e ele imprime `erro = "acesso-restrito"`.
2. `toast.error` **é chamado**.
3. Nada renderiza: `[data-sonner-toaster]` não existe no DOM.
4. Toast funciona no app — admin salvando Regras de Venda mostra "Regras de venda
   atualizadas!" normalmente.
5. O **mesmo toast com 1,2s de atraso aparece** (amostrando a cada 200ms desde
   `commit`, foi assim que o vi).

Conclusão: **toast disparado em efeito de montagem se perde.** O `Toaster` do
sonner assina o store depois do efeito rodar, e o sonner não repõe toast perdido
para quem assina atrasado.

**Correção:** aviso de bloqueio virou **conteúdo da página** — um `Alert` no topo
do painel, com mapa `BLOCK_REASONS` para os dois motivos. Sobrevive a recarga, é
lido por leitor de tela e não depende de corrida de montagem. É o eixo 1 do
checklist de frontend: erro tem que ser visível.

> Vale generalizar sem exagerar no escopo: qualquer aviso que dependa de `toast()`
> na montagem de uma tela tem esse risco. Não saí varrendo o sistema atrás disso
> nesta passada — fica anotado como padrão a checar nos módulos seguintes.

## Superfície de testes que descrevia o comportamento errado

Os 13 testes `@business` de `settings.spec.ts` que logavam como **operador** e
navegavam abas de admin **passavam por causa do bug**. Um deles, "S-11 tab
Recebimento tem form com submit", afirmava exatamente a falsa affordance. Outro
comentava a premissa: *"Operator accessing fiscal — page loads (RBAC check is on
mutations, not read)"*. E S-14 terminava em
`expect(typeof hasSubmit).toBe("boolean")` — uma tautologia que passa sempre.

Reescritos: quem precisa de tela de admin loga como admin; o bloco RBAC ganhou
asserções de verdade (S-14, S-15, S-18, S-19), cobrindo o bloqueio por URL direta,
o aviso visível, as duas abas que o operador mantém e o admin intacto.

Detalhe operacional que quase me pegou: `@business` **só roda pós-merge** (o CI do
PR roda `@smoke`). Sem varrer as specs antes, eu mergearia e a `main` ficaria
vermelha por 13 testes.

## Pendências deste módulo para o dono (fim do programa)

Medições que sustentam cada uma:

1. **A política de senha não tem tela.** `minPasswordLength`, exigência de
   maiúscula/número/símbolo e expiração de senha **são aplicados de verdade**
   (`password-policy.service.ts` → `lib/password.ts`), mas a procedure de escrita
   (`settings.updateSecurity`) **não tem nenhuma tela chamando** e a tabela está
   vazia. Todo tenant roda nos defaults, para sempre. `/settings/security` só
   troca senha.
2. **O logout por inatividade nunca dispara.** `IdleTimeout` no layout lê
   `sessionTimeoutMinutes`, que fica sempre nulo pelo mesmo motivo. A memória do
   projeto descreve o recurso como "opt-in pelo tenant via Config → Segurança" —
   **esse opt-in não existe na UI.**
3. **9 procedures de `settings` e 1 de `auth` sem nenhuma tela chamando**:
   `upsertInstallmentRules`, `upsertPaymentRates`, `listTeam` (a tela virou
   redirect para `/settings/users`), `updateFiscalCertificate`,
   `removeFiscalCertificate`, `updateSecurity`, `listNotificationConfigs`,
   `upsertNotificationConfig`, `toggleNotificationConfig`,
   `auth.validateTenantAccess`. Duas dessas (as de certificado fiscal) pertencem
   ao módulo adiado.

Vale notar que **`updateSecurity` foi mantida de propósito**, apesar de morta: é
o único caminho para configurar uma política que **é aplicada**. Removê-la
tornaria a política permanentemente imutável por desenho.

## Um transversal que caiu por não se sustentar

Eu vinha carregando desde o Módulo 5 a ideia de que o `ErrorBoundary` "esconde
crash de componente sem avisar o usuário". Fui verificar aqui:
`src/app/(app)/error.tsx` **mostra uma mensagem clara e visível** — "Algo deu
errado nesta tela", com botões de tentar novamente e ir para o painel, dentro do
layout, preservando a navegação.

A premissa da minha nota estava errada como enunciada. Corrigi o doc do Módulo 5
e **o item não virou achado**. O que eu tinha de fato era: o componente lançou,
foi capturado e o console registrou — não que o usuário ficasse sem aviso. As
capturas do pré-correção já tinham sido sobrescritas, então o caso não é mais
decidível.

Fica a lição: **anotar hipótese como se fosse achado contamina o módulo
seguinte.** Passei a marcar explicitamente o que é medido e o que é suposto.

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit         # 2026 verdes
pnpm test:e2e __tests__/e2e/settings.spec.ts          # 19 verdes
pnpm test:e2e --grep @smoke                           # 27 verdes
pnpm tsx scripts/audit/crawl-module.ts config         # 0 quebradas · 0 atenção
```

Migration `drop_unenforced_lockout_policy` — remove duas colunas de uma tabela
vazia em produção.

**Falha antes do fix, verificada:** neutralizei `isAdminOnlySettingsPath` e os dois
testes novos de bloqueio (S-14, S-18) reprovaram; tirei o `adminOnly` do menu e o
guardião de unidade reprovou apontando as rotas oferecidas ao operador.

**Crawler:** 19 telas × admin/operador × 1440/390 = 76 visitas, **0 quebradas, 0
atenção**. Os 42 redirects se explicam inteiros: 8 do admin (4 stubs — `/settings`,
`/settings/depix`, `/settings/team`, `/settings/users/new`) e 34 do operador (17
por passada: os 4 stubs + as 15 abas de admin, menos as 2 que ele mantém). Nenhum
overflow horizontal no mobile em papel nenhum — as correções de primitivo dos
Módulos 2–4 (`PageHeader`, breadcrumb, `TabsList`) seguem cobrindo.

## Uma correção no harness

O crawler logava **4 vezes por módulo** (papel × viewport). Em módulo grande, três
varreduras seguidas esgotavam o limitador de tentativas do login e o harness passava
a se bloquear sozinho — me travou três vezes. Agora ele faz **um login por papel** e
reaproveita o estado de sessão nos dois viewports, em memória (nada de cookie de
produção em arquivo).
