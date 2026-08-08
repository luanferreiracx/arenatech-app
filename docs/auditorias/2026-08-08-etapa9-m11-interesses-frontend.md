# Etapa 9 · Módulo 11 — Interesses (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** `/interests`, `/interests/new`, `/interests/[id]`
**Provas:** código · dado de produção · navegador real

---

## Sumário

O módulo mais movimentado que auditei nesta etapa: **126 leads em menos de um
mês** (11/07 a 07/08).

| status | leads | período |
|---|---|---|
| WAITING | **120** | 11/07 – 07/08 |
| COMPLETED | 6 | 31/07 – 06/08 |
| interações registradas | **0** | — |

Dois defeitos de reflow corrigidos. E um achado de método que quase virou um
falso positivo — o ambiente local estava medindo um banco desconectado.

---

## INT-1 — o status do lead nascia a 475px · **corrigido**

A tabela mede **751px** numa área visível de **222** a 320px. A ordem era
`Nome | Telefone | Tipo | Modelo | Status | Data | Ações`:

| coluna | começava em | visível? |
|---|---|---|
| Nome | 73px | sim |
| Telefone | 187px | sim |
| Tipo | 291px | **não** |
| Modelo | 373px | **não** |
| **Status** | **475px** | **não** |
| Data | 572px | **não** |
| Ações | 708px | **não** |

**Cinco das oito colunas fora de vista.** Num módulo de leads, "em espera /
contatado / finalizado" é o que organiza o trabalho — sem ele a lista mostra
nomes e não diz o que fazer com nenhum.

**Correção:** `Status` logo após `Nome`, no cabeçalho **e** no corpo (reordenar
só o `<thead>` desalinharia todas as células). Depois: `Status` começa em
**187px**.

### Terceira ocorrência da mesma classe nesta etapa

| módulo | coluna escondida | começava em |
|---|---|---|
| M8 — Comissões (CMU-9) | Valor da alíquota | 356px |
| M10 — Comunicação (CMN-1) | Status do envio | 707px |
| **M11 — Interesses (INT-1)** | **Status do lead** | **475px** |

O padrão é estável: a coluna que **decide a ação** é declarada por último e
nasce fora da tela. Sempre passa no teste de reflow, porque `overflow-x-auto` é
estratégia válida da WCAG 1.4.10 — a norma é cumprida e a informação se perde.

---

## INT-2 — seis cartões enterravam a lista · **corrigido**

`grid gap-4 md:grid-cols-6` não tem passo intermediário: abaixo de 768px vira
**uma coluna**. Seis cartões de estatística empilhados consumiam **~900px** de
rolagem antes de a tabela aparecer.

**Correção:** `grid-cols-2 sm:grid-cols-3 md:grid-cols-6` + `[&>*]:min-w-0`.

### Um erro que a medição pegou

Ao ver "Em espera" quebrando em duas linhas, quase apliquei `whitespace-nowrap`
só nele. A medição mostrou outra coisa:

| rótulo | cortado em |
|---|---|
| Cancelados | 11px |
| Contatados | 9px |
| Finalizados | 8px |
| Em espera | 4px |
| Conversão (0/1) | 4px |

**Cinco dos seis já eram cortados** — o `CardContent` traz `px-6` (24px de cada
lado) e num cartão de ~145px sobram ~97px para o texto. O `whitespace-nowrap`
teria mascarado 1 caso de 6 e me deixado satisfeito.

A correção real foi `px-3 sm:px-6`: **zero cortes nos seis**, todos alinhados em
16px de altura.

---

## Guardião

`__tests__/unit/interesses-colunas-e-cartoes.test.ts` — 7 asserções, incluindo
uma que verifica se o **corpo da linha segue a mesma ordem do cabeçalho** (o erro
clássico de reordenar tabela) e outra que barra `whitespace-nowrap` como remendo.

Visto falhar antes de aceito: **6 de 7 vermelhas** contra o código não corrigido.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2529 testes** verdes.

---

## O ambiente local estava medindo um banco fantasma

Vale registrar porque **contaminou medições anteriores desta etapa**.

A tela de interesses devolvia **HTTP 500**:

```
The column `interests.unsubscribed` does not exist in the current database
```

Primeira reação seria registrar como achado. Verifiquei produção: **a coluna
existe**, com índice parcial. E o banco local de testes também tem, com as 226
migrations em dia.

A causa: o `.env` aponta para `127.0.0.1:5435`, **porta fechada**. O dev server
tinha sido iniciado quando aquele banco existia e mantinha um pool de conexões
vivo servindo de um estado antigo — por isso o app "funcionava" enquanto o
`prisma migrate status` não conseguia sequer conectar.

**Isso explica retroativamente a falsa divergência do M8**, onde a tela mostrava
gross R$ 519,55 e produção tinha R$ 1.597,69. Na hora atribuí a "cópia local
defasada"; a explicação real é mais grave — eu media um banco ao qual nada mais
escrevia.

Com autorização do dono, reiniciei o dev server apontando para o banco local de
testes (`localhost:5432`, o mesmo de `test:integration:prepare`), sem alterar o
`.env`. As medições deste módulo são as primeiras da etapa feitas contra um banco
com as migrations em dia.

---

## Registro sem proposta

### R1 — 120 leads parados em "Em espera", o mais antigo de 11/07

| | |
|---|---|
| WAITING | **120** (95%) |
| COMPLETED | 6 |
| CANCELLED | 0 |
| taxa de conversão | **4,8%** |

Ninguém cancelou nenhum lead em quase um mês, e 120 seguem no estado inicial.

Duas leituras possíveis, e não tenho como distinguir pelo dado: os leads são
trabalhados por fora (WhatsApp direto) e o status nunca é atualizado na tela; ou
eles simplesmente não estão sendo trabalhados.

O INT-1 é uma pista concreta para a primeira hipótese: **o status ficava fora da
tela no celular**, então quem olha a lista pelo telefone nunca via o estado e
nunca teve motivo para mudá-lo.

### R2 — a tabela `interest_interactions` está vazia

**0 registros.** A tabela existe para guardar o histórico de contato com o lead
(ligou, mandou mensagem, cliente respondeu) e nunca recebeu nada.

Sem histórico de interação, não há como saber se um lead em "Em espera" foi
contatado cinco vezes ou nenhuma — o que torna os 120 do R1 impossíveis de
interpretar.

Não proponho porque é decisão de produto: registrar interação dá trabalho ao
operador, e só compensa se alguém for usar o dado.

---

## O que preservar

1. **`QueryErrorState` na lista** (CLU-1) — falha de query mostra erro, não
   "nenhum interesse". A mesma armadilha já corrigida na lista de clientes; aqui
   o cuidado foi propagado.
2. **Filtros resetando a paginação** — `setPage(0)` em busca, status e tipo.
3. **Seleção em massa com estado indeterminado** — o checkbox do cabeçalho
   distingue "todos", "alguns" e "nenhum" da página atual, e o `aria-label` de
   cada linha nomeia o lead.
4. **Envio em lote com cooldown** — `sendBatch` reporta enviadas, em cooldown e
   falhas separadamente, em vez de um "sucesso" genérico.
