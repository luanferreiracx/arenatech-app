# Módulo 9 — Clientes / Interesses

**Passada A (backend):** concluída em 2026-07-30.
**Passada B (frontend):** pendente (7 telas).

## Superfície

| | |
|---|---|
| Routers | `customer.ts` (460, 8 procedures), `interest.ts` (508, 10 procedures) |
| Serviço | `interest-conversion.service.ts` — vínculo automático lead → venda/OS |
| Tabelas | `customers`, `interests`, `interest_interactions` |
| Telas | `/customers` (4), `/interests` (3) |

## O que a produção diz (medido em 2026-07-30)

| | |
|---|---|
| Clientes | 1.384 (0 deletados, 0 opt-outs) |
| Interesses | **75, todos `WAITING`** |
| Interações | **0** |
| Interesses convertidos | **0** |
| Interesses notificados em massa | 0 |

Os 75 leads foram criados entre **11 e 30 de julho** — o módulo está sendo
alimentado agora, ~4 por dia. Todos têm telefone. Nenhum saiu de `WAITING`,
nenhum registrou interação, nenhum converteu.

É o mesmo formato do Módulo 8: um fluxo que para no primeiro passo. Só que aqui
não é desuso — é defeito, e a medição abaixo mostra qual.

## Achados

### CL-1 — a conversão automática de lead nunca casou um único telefone (P1)

`linkInterestConversionByPhone` roda dentro da transação da venda/OS e procura um
interesse aberto com o mesmo telefone, para marcar `COMPLETED` + `convertedAt`.
A busca era **igualdade exata**:

```ts
const digits = normalizePhoneDigits(params.phone);   // 11 dígitos, do cliente
where: { phone: digits }                             // coluna crua do interesse
```

O problema é que o mesmo telefone entra no sistema em três formatos:

| Origem | Como fica gravado | Dígitos |
|---|---|---|
| cadastro de cliente | `(86) 99999-9999` | 11 |
| interesse pelo painel | normalizado, com DDI se o operador digitou | 13 |
| interesse pelo bot | **telefone cru do WhatsApp** | 12–16 |

Medido em produção:

- distribuição de dígitos dos **clientes**: 11 dígitos em **1.278** dos 1.384;
- distribuição de dígitos dos **interesses**: 12 (50), 16 (18), 15 (5), 13 (2) —
  **nenhum com 11**;
- **23 dos 75** nem só-dígitos eram: tinham máscara.

Ou seja, a condição era **impossível de satisfazer**. Não é "casa pouco": é
"nunca casa".

**Prova de dados do impacto:** cruzando os últimos 8 dígitos, **6 dos 75 leads
abertos pertencem a clientes que compraram ou abriram OS depois de virar lead**.
O painel de conversão mostrava 0% quando o real era pelo menos 8%.

A causa da divergência de formato está no bot: `handoff.ts` gravava
`phone: ctx.conversation.contactPhone` cru, enquanto a procedure do painel já
normalizava. E o próprio bot **sabia disso** — a busca de idempotência dele usa
`phone: { contains: contactPhone.slice(-9) }`, um contorno que o conversor não
tinha. Dois escritores, dois formatos, e o leitor assumindo um terceiro.

**Correção, em três partes** (as três são necessárias — qualquer uma sozinha
deixa um buraco):

1. `phoneMatchKey()` em `lib/validators/customer.ts`: os últimos 8 dígitos, o
   número do assinante. Uma chave, um lugar.
2. O bot passa a normalizar na escrita, como o painel já fazia.
3. Migration `normalize_interest_phone` limpa o que já está gravado — sem ela os
   23 mascarados continuariam escapando, porque um valor com máscara termina em
   `"9999"` e não em `"99999999"`.

> **Falso positivo aceito, conscientemente:** dois contatos com os mesmos 8
> últimos dígitos em DDDs diferentes casariam. Com 75 leads abertos o risco é
> desprezível, e o custo do erro (marcar um lead como convertido) é menor que o
> de nunca converter nenhum. O piso de 8 dígitos que já existia foi mantido.

### CL-2 — o disparo em massa ignorava o opt-out de LGPD (P1)

`Customer.unsubscribed` tem no schema o comentário: *"Opt-out de comunicacoes
(LGPD). Quando true, sendMessage falha com mensagem clara antes de chamar
provider."* E é verdade — em `communication.sendMessage`, o envio **um a um**.

`interest.sendBatch`, o envio **em massa**, nunca consultava o campo. Bastava
mandar pelo painel de interesses em vez do de clientes para furar o descadastro —
e justamente pelo caminho que atinge várias pessoas de uma vez.

Sexta vez que este programa encontra o mesmo padrão: **duas implementações do
mesmo controle, o endurecimento numa e os usuários na outra.**

**Correção:** o opt-out é da **pessoa**, não do registro. O lote consulta os
descadastrados do tenant e pula tanto o interesse vinculado (`customerId`) quanto
o **não vinculado cujo telefone bate** — todos os 75 de produção têm
`customer_id` nulo, então sem o casamento por telefone o descadastro seria
contornável só não vinculando o lead.

A comparação é **em memória**, não no SQL: `customers.phone` é campo de exibição
e guarda máscara em **329 dos 1.384** registros, então um `endsWith` no banco
erraria exatamente esses. O conjunto de opt-outs é pequeno por natureza — é gente
que pediu para sair.

Latente hoje (0 opt-outs em produção), mas é controle legal e estava ausente no
caminho de maior alcance.

## O que foi verificado e está íntegro

- **Unicidade de CPF/CNPJ por tenant**: 0 duplicatas em 1.384 clientes — os
  índices parciais em SQL cru seguram o que o Prisma não expressa.
- **`sendBatch` já era admin-only, com cooldown anti-spam e HTTP fora da
  transação** — as três coisas vieram da auditoria de 2026-07-11 e continuam de pé.
- **Paginação**: `take` em todas as listas dos dois routers.
- **Soft delete**: 0 clientes deletados em produção; leituras filtram `deletedAt`.

## Observações registradas, não corrigidas

1. **87 clientes sem telefone** (6%). A coluna é `NOT NULL` no schema, mas guarda
   string vazia — herança da migração do Laravel. Esses registros são invisíveis
   a qualquer casamento por telefone, inclusive à conversão de lead. Backfill não
   é possível sem os dados; anotado para não virar surpresa.
2. **6 grupos de clientes compartilham telefone.** Não é defeito — família usa o
   mesmo número. Vale saber ao ler qualquer métrica chaveada por telefone.
3. **`customers.phone` não é normalizado.** É campo de exibição e 329 registros
   têm máscara. Normalizar exigiria decidir o formato de exibição na UI; fora do
   escopo desta passada, e contornado onde importa (comparação em memória).

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit   # 2030 verdes
pnpm test:integration                           # 302 verdes (11 novos)
```

**Falha antes do fix, verificada** — restaurei cada condição antiga e os testes
reprovaram com a assinatura do defeito:

```
CL-1, com igualdade exata de telefone:
  × lead do painel com DDI converte numa venda do cliente sem DDI
      expected null to be 'ca1888ff-…'        ← não converteu nada
  × lead gravado pelo bot também converte
  × com dois leads abertos, converte o mais antigo

CL-2, sem a guarda de opt-out:
  × pula o lead VINCULADO a um cliente descadastrado    expected +0 to be 1
  × pula o lead NÃO vinculado cujo telefone é dele      expected +0 to be 1
```

Migration `normalize_interest_phone`: idempotente, toca só as linhas com máscara.
