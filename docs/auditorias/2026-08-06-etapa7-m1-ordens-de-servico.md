# Etapa 7 · Módulo 1 — Ordens de Serviço

> Varredura **por módulo** (o eixo que faltou no programa por dimensão).
> Skill `audit-backend`, três provas: código, dado de produção, navegador real.
> Data: 2026-08-06.

## Correção de premissa

Eu apresentei este módulo como "zero menções nas 6 auditorias, primeira varredura
dedicada". **A segunda metade estava errada.** O arquivo carrega 4 auditorias
datadas anotadas no próprio código (09/07, 10/07, 11/07, 25/07) e tem 176 linhas
de documento no programa FINALIZACAO.

O que faltou foi a passada **por dimensão** junto com o resto do sistema — não
auditoria nenhuma. A lacuna que você apontou é real, mas menor do que eu
descrevi.

Isso muda a leitura dos achados: o rendimento é baixo em defeito grosso e
concentrado em **assimetrias residuais** — lugares onde uma correção anterior
fechou a instância e não a classe.

---

## Prova 2 — dado de produção

255 OS, em uso ativo (última de 05/08). Sete checagens de invariante:

| checagem | resultado |
|---|---|
| `total_amount` ≠ serviço + peças − desconto | **0** |
| `total_amount` negativo | **0** |
| REFUNDED sem `refunded_at` | **0** |
| PAID sem venda vinculada | 1 |
| DELIVERED sem `delivered_date` | 1 |
| CANCELLED com venda COMPLETED | 1 |
| `paid_amount` > `total_amount` | 2 |

**Todas as 4 anomalias são pré-correção**, e cada uma foi rastreada até a causa:

- **CANCELLED com venda COMPLETED** (`OS202600240`, R$ 809,98): o histórico mostra
  `OPEN → CANCELLED`, nunca passou por PAID. A venda de pagamento saiu em 23/05 e
  a OS foi cancelada em 15/07 com a nota *"era uma os de teste"*. São 3 casos no
  total (CANCELLED, OPEN, READY_FOR_PICKUP), **todos anteriores ao guard PDV5**
  (`sale.ts`, 08/07). **0 depois.**
- **`paid_amount` > `total_amount`**: 2 casos, ambos de março — pré-migração.
- **DELIVERED sem data**: 1 caso de 22/05, com histórico **vazio** (nem o registro
  de criação). É assinatura de inserção manual na migração, não bug de código:
  2 de 88 OS pós-migração estão nessa condição.

---

## Prova 3 — navegador real

4 rotas (`/service-orders`, `/service-orders/new`, `/operation`, `/services`) ×
2 perfis (admin, operador), contra a cópia de produção: **200 em todas, zero
erro de console**.

Mas medir não é olhar. Abrindo uma OS **paga** e comparando os dois perfis:

| | admin | operador |
|---|---|---|
| vê custo | ✅ sim | ✅ **não** (RBAC ok) |
| botão **Estornar** | sim | ❌ **sim** |
| botão **Descancelar** | sim | ❌ **sim** |

→ **M1-2**, abaixo. Foi a prova de uso que pegou; o crawler dizia "ok".

---

## Achados

### M1-2 — Operador vê botões admin-only (P2) — ✅ CORRIGIDO

`service-order-detail.tsx:467` (Estornar) e `:456` (Descancelar) verificam status
e `benchMode`, mas **não `isAdmin`** — enquanto o botão **Excluir**, 5 linhas
acima (`:462`), verifica.

**O servidor bloqueia corretamente:** `refund` (`service-order.ts:1317`) e
`uncancel` (`:1190`) exigem `isTenantAdmin` inline, conforme o ADR 0053. Não é
vulnerabilidade — é UX que oferece uma ação que sempre falha, num botão vermelho
que devolve dinheiro.

Das 15 procedures admin-only do router, 3 têm botão direto: `delete` tinha a
guarda, `refund` e `uncancel` não.

**Corrigido.** O teste afirma a **paridade** entre o gate do servidor e a
condição de render da tela, para as três ações — fecha a classe, não a instância.
Verificado no navegador: numa OS paga o admin mantém Estornar e o operador não o
vê; numa OS cancelada, o mesmo para Descancelar. O botão de controle (Recibo)
segue visível para ambos.

### M1-1 — `checkDeliveryTermStatus` sem CAS nem re-leitura (P2)

`service-order.ts:3568-3627`: lê a OS em tx1, sai da transação para chamar a
Autentique por **HTTP**, decide a partir do status obsoleto (`:3599`) e grava com
`update()` cru (`:3601`).

**A evidência de que é lapso está a 170 linhas de distância:** o irmão
`checkReturnTermStatus:3797` faz o mesmo HTTP-fora-da-tx e **re-lê o status
dentro da tx2**, com comentário explícito dizendo por quê. O `checkDeliveryTerm`
não recebeu a mesma correção.

Falha possível: OS estornada durante a espera da Autentique é sobrescrita para
`DELIVERED` — dinheiro devolvido, aparelho marcado como entregue.

**Prova de dado:** não medi ocorrência (exigiria correlacionar `refunded_at` com
o histórico de entrega). Confiança: alta no código, não verificada no dado.

### M1-3 — 4 escritas de caixa sem `lockOpenCashSessionOrThrow` (P2, latente)

A OS é o **único router de dinheiro sem o lock**: `sale.ts` (1), `cashier.ts` (5),
`financial.ts` (2), `service-order.ts` (**0**, com 4 `writeCashMovement`).

É a sétima instância do padrão que corrigi no B9 — e a nota que escrevi lá
(`sale.ts:1830-1838`) nomeia a classe: *"a correção fecha a instância, não a
classe."*

**Prova de dado que rebaixa a severidade:** os pagamentos diretos de OS (que
acionam esses writes) **pararam em 21-22/05**, na migração. Depois disso: **0
pagamentos diretos com valor**. Os 110 casos históricos são todos do Laravel. O
fluxo vivo hoje é OS → PDV, que **tem** o lock desde o B9.

Continua sendo dívida real — o caminho existe e pode ser reativado.

### M1-4 — Produto serializado em OS é ignorado em silêncio (P3)

`os-stock.service.ts:76-80`: se `product.isSerialized`, a função **retorna sem
fazer nada e sem erro**. Comentário: *"handled separately (future) — OS items
with serialized products are rare"*.

O modo de falha não é estoque negativo, é o oposto: a peça é consumida no
conserto, o inventário segue contando como disponível, e ela pode ser vendida no
PDV. O `return` mudo é indistinguível de sucesso para o chamador.

**Prova de dado:** **0 itens serializados em OS** em produção. "São raros" está
correto — hoje são zero. É armadilha, não sangramento.

### M1-5 — `IN_WARRANTY` é estado inalcançável (P3)

Está no enum, tem label/ícone/cor, é contado no dashboard, é tratado como especial
no `updateStatus`, é bloqueado no `delete` e é `ACTIVE_WARRANTY_STATUS` no
Talison — mas **nenhum código escreve esse status**, e nenhuma transição o tem
como destino.

A garantia real é modelada por `isWarranty` (boolean) + `originalOrderId`. O peso
morto induz erro de leitura: quem lê o `delete` acredita que OS de garantia está
protegida, e essa proteção nunca dispara.

---

## O que NÃO encontrei

Digo com todas as letras, porque o módulo apanhou muito e o resultado é bom:

- Caminho de dinheiro fora do ledger — **não há**
- Estorno duplo ou pagamento duplo — **CAS em 6 pontos** (`updateStatus`,
  `registerPayment`, `refund`, `uncancel`, `delete`, `cancel`)
- Reabertura de estado terminal sem RBAC — `REFUNDED` é absorvente
- Baixa de estoque sem CAS — `os-stock.service.ts:82-93` usa o padrão
  `updateMany({currentStock: {gte: qty}})`
- IDOR na superfície pública — token opaco de 12/16 chars, `@unique`, nunca id
- Vazamento de custo em endpoint anônimo — whitelist explícita, com
  `diagnosedProblem` e notas internas **deliberadamente omitidos**
- RBAC divergente do ADR 0053 — 8 gates admin conferidos, todos coerentes

## Áreas de baixa confiança

- **M1-1 não tem prova de dado.** Verificar exigiria correlacionar `refunded_at`
  com histórico de entrega; não fiz.
- **Não exercitei o fluxo completo no navegador** (criar OS → diagnóstico →
  orçamento → pagamento → entrega). Naveguei as telas e inspecionei uma OS paga.
- **`updateStatus` tem 223 linhas** e chama WhatsApp (HTTP) **dentro** da
  transação (`:1089-1105`) — os outros 6 caminhos usam o padrão `prep` (HTTP
  fora). Não classifiquei como achado porque é best-effort com try/catch, mas
  segura conexão do pool.
