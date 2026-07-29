# Módulo 4 — Ordens de Serviço / Serviços / Operação

**Passada A (backend):** concluída em 2026-07-29.
**Passada B (frontend):** concluída em 2026-07-29.

## Superfície

| | |
|---|---|
| Routers | `service-order.ts` (51 procedures, era 52), `operation.ts` (15), ~~`checklist.ts`~~ (removido) |
| Serviços | `os-assignee`, `os-cancellation`, `os-nfse-storage`, `os-service-provider-payable`, `os-stock`, `os-technician-report` |
| Rotas REST | 7 (`upload`, `pdf`, `quote-pdf`, `recibo`, `termo-entrega`, `termo-devolucao`, `technician-report/pdf`) |
| Páginas públicas | `/os/[publicLink]`, `/quote/[link]` |
| Telas | `/service-orders/*`, `/services/*`, `/operation` |

## Invariantes que o módulo promete

1. Orçamento respondido pelo cliente muda de estado **uma vez só**, e a OS acompanha.
2. OS cancelada libera estoque reservado e cancela recebíveis — por todas as portas.
3. OS paga/entregue tem contrapartida financeira.
4. Documento público expõe só o que é público.
5. Filtro por período respeita o fuso.

Quebrou a **1**.

## Prova de dados (snapshot de produção, 2026-07-29)

| Medição | Valor |
|---|---|
| Ordens de serviço (não apagadas) | 236 |
| Entregues/pagas com valor | 145 |
| …sem contrapartida financeira | 37 — **todas de nov/2025 a mai/2026**, anteriores ao corte do Laravel; **0 desde jun/2026** |
| Canceladas com peça presa | 0 |
| Itens de OS do tipo PRODUCT | **0** |
| Laudos do módulo `/checklist` | **0** |

## Achados

### OS-1 — o orçamento público podia ser respondido duas vezes (P1)

`serviceOrder.respondToQuote` é **público**: o cliente aprova ou rejeita por um
link, sem sessão. O guard de "já foi processado" é read-then-write — lê
`status === "pending"` e depois grava com `update({ where: { id } })`, sem
repetir a condição.

Reproduzido: duas respostas concorrentes **passam as duas**. Medido no teste,
antes da correção:

- aprovar + rejeitar ao mesmo tempo → `['fulfilled', 'fulfilled']`, as duas aplicadas;
- duplo clique em aprovar → **2** eventos no histórico da OS em vez de 1.

Cada resposta mexe no orçamento **e** na OS (restaura status, limpa
`pendingQuoteId`, escreve histórico). Um entrelaçamento deixa o orçamento
dizendo uma coisa e a ordem de serviço, outra — estado contraditório que nenhuma
tela explica. E o gatilho é banal: cliente com o link aberto em dois aparelhos,
ou dedo pesado no botão.

**Correção:** claim com a condição repetida no `where` (`updateMany` com
`status: "pending"`), nas duas transições. Quem perde a corrida recebe "Este
orcamento ja foi processado" — a mesma mensagem que o guard já dava.

### OS-2 — o módulo `/checklist` gravava laudo que ninguém conseguia ver (P2)

O módulo tinha **7 procedures e uma única tela**. Só `create` estava ligada:
não havia listagem, detalhe, edição, exclusão, busca por IMEI nem estatística —
as outras 6 existiam no servidor sem nenhuma UI. Ao finalizar, a página mostrava
os 8 primeiros caracteres do ID e pronto: o laudo entrava no banco e não havia
caminho de volta.

Produção: **0 laudos**. Ninguém usou desde que existe.

**Decisão do dono:** remover o módulo inteiro (página, router, item de menu,
entradas de gating). A tabela permanece, vazia.

> Não confundir com o **checklist de entrada da OS**, que é outra coisa e
> continua intacto — o dono já decidiu que os dois não se unificam.

### OS-3 — `saveSignaturePad` sem chamador (P2)

Procedure de assinatura em tela sem nenhuma tela chamando. Removida.

## Verificado e descartado (não viraram achado)

Registrado para não ser re-investigado:

- **Fuso horário** — `service-order.ts` e o relatório de técnicos **já usam** `startOfDayBrt`/`endOfDayBrt`. Sem defeito, ao contrário dos módulos 1, 2 e 3.
- **As duas páginas públicas** (`/os/[publicLink]`, `/quote/[link]`) consomem **procedures tRPC**, não Prisma direto. O padrão que mordeu nos módulos 1 e 2 (página furando o endurecimento do procedure) **não se repete aqui**.
- **7 rotas REST** — todas com sessão + tenant; as de documento são PDF (não HTML, sem risco de injeção); nenhuma expõe custo/margem. O `upload` valida o tipo do arquivo (`validateImage`) e limita a 10 MB.
- **Estorno de OS paga em dinheiro** — o furo registrado como "R1" na auditoria de 2026-07-14 (pular a saída de caixa) **já está corrigido**: há guard com `paymentMethodAffectsCashDrawer` + `refundNeedsOpenCashSession`.
- **37 OS sem contrapartida financeira** — todas anteriores ao corte do Laravel; nenhuma produzida pelo código atual.
- **"Peça na OS" segue com 0 uso.** O drift de enum foi corrigido em 2026-07-25 e desde então ninguém usou o recurso. Não é defeito — é adoção, e é informação de produto.

## Achados da passada de frontend

Varredura das 10 telas × admin/operador × desktop/mobile = 40 combinações.
**0 quebradas; 2 de atenção, com um defeito por trás.** As correções
compartilhadas dos módulos 1–3 (`PageHeader`, breadcrumb, `min-w-0` em grid) já
tinham limpado o resto deste módulo antes de eu chegar nele — é o retorno de ter
corrigido na raiz em vez de por tela.

### OS-4 — a faixa de abas empurrava a página no celular (P1, transversal)

`/operation` tem 4 abas (Entregadores, Laboratórios, Envios Lab, Prestadores). O
`TabsList` do shadcn é `inline-flex w-fit` **sem teto e sem estratégia de
overflow**: a faixa fica mais larga que a tela (medido **399px numa viewport de
390**) e empurra a página inteira.

A correção foi no **primitivo**, não na página: `max-w-full` + `overflow-x-auto`
(preservando o comportamento vertical). **Vale para as 9 telas do app que usam
abas**, não só a que a varredura pegou.

> **Quarta vez que o mesmo mecanismo aparece** — componente compartilhado sem
> estratégia de overflow empurrando a página: `PageHeader` (M2), grid de cards e
> breadcrumb (M3), agora `TabsList`. Corrigir no primitivo tem pago mais que
> corrigir na tela: este módulo chegou quase limpo por causa disso.

## Reconciliação e verificação de uso

- **Página pública da OS** (`/os/[publicLink]`) medida no celular: **sem
  estouro**. É a que o cliente abre no telefone, então valia conferir
  explicitamente.
- **Regressão nos módulos já fechados** após mexer no primitivo de abas: Caixa,
  PDV e Estoque revarridos — **0 quebradas, 0 de atenção** nos três.

## Observação de ambiente (não é achado do módulo)

Varreduras seguidas derrubam o login: várias tentativas do mesmo IP em sequência
esgotam o limitador (que cai para memória local porque o Redis do `.env` aponta
para uma porta morta no ambiente de auditoria). Passa sozinho depois de ~1
minuto. O trade-off "lockout × captcha" no login já está registrado como decisão
do dono desde a auditoria de 2026-07-14; fica para o **Módulo 10**.

## Checklist de frontend

| Eixo | Situação |
|---|---|
| 1. Erro visível | ✅ (correção transversal do M1) |
| 2. Carregando / disabled | ✅ diálogos destrutivos da OS já corrigidos em #717 |
| 3. Invalidação após mutação | ✅ |
| 4. Estado vazio | ✅ |
| 5. Permissão | ✅ custo/margem admin-only desde #583 |
| 6. Formatação pt-BR | ✅ |
| 7. Mobile 390px | ✅ corrigido (OS-4) — 40 combinações limpas + página pública |
| 8. Acessibilidade | ✅ faixa de abas rolável mantém todas alcançáveis |
| 9. Reconciliação | ✅ página pública verificada no celular |
| 10. Console e rede | ✅ 0 erro, 0 4xx/5xx não tratado |
| 11. Fluxo incompleto | ✅ resolvido no backend (OS-2, OS-3) |

## Checklist de backend

| Eixo | Situação |
|---|---|
| 1. RBAC | ✅ estorno, edição de custos e cancelamento com gate; custo/margem admin-only desde #583 |
| 2. Gating de módulo | ✅ `serviceOrder`/`operation` mapeados; entrada morta de `checklist` removida |
| 3. Validação de entrada | ✅ |
| 4. Tenant/RLS | ✅ `withAdmin` só nos caminhos públicos por design |
| 5. Concorrência | ✅ corrigido (OS-1); cancelamento já tinha CAS e ponto único (`applyOsCancellation`) |
| 6. Dinheiro | ✅ |
| 7. Estoque | ✅ reserva/liberação por ponto único |
| 8. Tempo (BRT) | ✅ já estava correto |
| 9. Soft delete | ✅ |
| 10. Performance | ✅ |
| 11. Erro e observabilidade | ✅ |
| 12. Transação | ✅ |
| 13. Superfície morta | ✅ corrigido (OS-2, OS-3) |

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit    # 2007 verdes
pnpm test:integration                             # 88 arquivos, 279 testes verdes
```

Teste que **falha antes** da correção:
`__tests__/integration/os-quote-response-cas.test.ts` — antes do fix devolvia
`['fulfilled','fulfilled']` e 2 eventos de histórico.
