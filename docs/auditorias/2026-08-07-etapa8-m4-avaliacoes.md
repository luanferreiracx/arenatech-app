# Etapa 8 · Módulo 4 — Avaliação de aparelhos

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-backend`.

## O que este módulo é

Apesar do nome, `device_valuations` **não guarda avaliações individuais**: é a
**tabela de preços** que a loja paga pelo aparelho usado, indexada por
`(modelo, armazenamento, saúde da bateria)`.

**232 linhas, 37 modelos, R$ 100 a R$ 5.000** em produção. O valor daqui vira
trade-in na venda e é enviado ao cliente por WhatsApp.

---

## E8-4 — Duas linhas ativas, dois preços, nenhuma constraint — ✅ CORRIGIDO

Não havia **nenhuma** garantia — nem no banco, nem no `create` — impedindo duas
linhas ATIVAS para a mesma combinação.

### Provado no navegador

Duas inserções da mesma combinação, valores diferentes, **ambas aceitas**:

```
1ª (R$ 1.000) -> HTTP 200
2ª (R$ 5.000) -> HTTP 200    <- mesma combinação
```

Confirmado no banco: duas linhas `TESTE-DUP-AUDIT / 128GB / > 90%`, R$ 1.000 e
R$ 5.000, ambas com `deleted_at IS NULL`.

`sendWhatsApp` monta a mensagem a partir dessas linhas, agrupando por
armazenamento. O **cliente** receberia duas linhas "Bateria > 90%" com preços
diferentes — e a loja não teria resposta para "qual vale?".

### Impacto medido: zero duplicatas hoje

232 linhas em produção, **0 combinações duplicadas**. É correção preventiva,
antes do primeiro erro de digitação — não incidente.

### O fix: índice único PARCIAL

```sql
CREATE UNIQUE INDEX device_valuations_ativa_unica
  ON device_valuations (tenant_id, modelo, armazenamento, saude_bateria)
  WHERE deleted_at IS NULL;
```

O `WHERE` é o que importa: soft delete é o padrão do projeto, e um `UNIQUE`
simples **impediria recadastrar** uma combinação apagada — quebraria um fluxo
legítimo.

Verificado contra a cópia de produção, os três comportamentos:

| ação | resultado |
|---|---|
| primeira inserção | passa |
| duplicata ativa | **recusada** |
| recadastro após soft delete | **passa** |

E a migration aplica **num banco limpo do zero** (exigência do CI, ADR 0045) —
testado criando `arenatech_migtest` e rodando `migrate deploy`.

O `try/catch` no `create` **não é a garantia** — é a tradução. Sem ele o admin
recebe um 500 opaco; com ele, sabe qual combinação colidiu e que deve editar a
existente.

---

## O que ataquei e resistiu

### RBAC: 7 de 8 mutations protegidas — e a oitava está certa

`assertCanManageValuations` (que é `isTenantAdmin`) guarda `create`, `update`,
`delete`, `bulkAdjust`, `duplicateModel`, `bulkAdjustFixed` e `deleteModel`.

Testado no navegador como operador:

```
bulkAdjust  -> 403 "Apenas administradores do tenant podem gerenciar avaliacoes"
deleteModel -> 403
create      -> 403
```

`sendWhatsApp` **não** tem o gate — e não deve ter: só lê a tabela e envia ao
cliente. É trabalho de atendimento.

### Isolamento: o `UPDATE` bruto sem `tenant_id`

`bulkAdjust` e `bulkAdjustFixed` usam `$executeRaw`:

```sql
UPDATE device_valuations SET valor = ROUND(valor * $factor, 2)
WHERE modelo = $modelo AND deleted_at IS NULL
```

**Não há `tenant_id` no `WHERE`.** A única defesa é o RLS — era o vetor mais
promissor da rodada de red team.

Testei: criei um preço "iPhone 13" no `audit-loja-2` a R$ 1.000, e um admin do
`arena-tech` rodou `bulkAdjust -50%` no mesmo modelo.

```
8 linhas atualizadas (todas do arena-tech)
preço do audit-loja-2: R$ 1.000,00  -> INTACTO
```

**O RLS segurou.** `forced row security` está ligado na tabela, com política
`tenant_isolation` por `current_tenant_id()`.

*(Os 8 preços que baixei em 50% foram restaurados com `× 2` na mesma transação;
estado final idêntico ao inicial — 232 linhas, R$ 100 a R$ 5.000, 0 resíduo.)*

### Concorrência

Os dois ajustes em massa são **um `UPDATE` atômico**, não loop de N updates — o
comentário no código registra que isso foi corrigido antes (gap Va1). Dois
ajustes percentuais concorrentes **compõem** corretamente (−10% e −10% = −19%),
que é o comportamento esperado. Não é corrida.

---

---

## E8-4b — A ponta que o próprio fix abriu (e meu erro ao fechá-la)

Ao adicionar o índice, `duplicateModel` passou a poder violar P2002: ele copia
todas as combinações de um modelo para outro, e se o destino já tiver alguma,
colide.

**Minha primeira correção estava errada**, e o navegador provou. Envolvi o
`create` num `try/catch` de P2002, contei as puladas e chamei de idempotente.
Resultado real:

```
1ª duplicação -> 200 {created: 8, skipped: 0}
2ª (mesma)    -> 500 "current transaction is aborted,
                      commands ignored until end of transaction block"
```

**No Postgres, uma violação de constraint aborta a transação inteira.** Capturar
o erro em JavaScript não a recupera — o `continue` seguia num transação morta, e
a query seguinte falhava. O `try/catch` parecia certo lendo o diff e era inútil
na execução.

A correção real é **filtrar antes de inserir**: carregar as combinações que o
destino já tem, remover essas da lista e fazer um `createMany` com o resto.
Verificado:

```
1ª duplicação -> 200 {created: 8, skipped: 0}
2ª (mesma)    -> 200 {created: 0, skipped: 8}
```

E o toast passou a dizer a verdade: *"3 avaliações duplicadas — 5 já existiam e
foram mantidas"*. Sem isso, o admin vê "3 duplicadas" numa cópia de 8 e acha que
perdeu 5.

**A lição:** o teste estático teria aprovado meu primeiro fix — ele afirma
estrutura, não comportamento. Quem pegou foi rodar no navegador. É o mesmo
motivo pelo qual esta auditoria exige três provas.

---

## Baixa confiança
- **Não auditei `sendWhatsApp` quanto a rate limit.** Ele dispara mensagem
  externa e é acessível ao operador; não verifiquei se há teto por período.
- **`validade_dias` tem default 7 na tabela e também vem de
  `TenantAssistanceSettings`** — duas fontes para o mesmo número. Não medi
  divergência entre elas.
