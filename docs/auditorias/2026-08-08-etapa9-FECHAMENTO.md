# Etapa 9 — fechamento da varredura

**Data:** 2026-08-08
**Skill:** `audit-frontend`

---

## Balanço final

Após a varredura das 124 rotas e as correções:

```
rotas estáticas medidas a 320px:          51
páginas que rolam horizontalmente:         0
elementos fora da viewport:                0
colunas decisivas ainda fora de vista:     5
```

*(51 e não 53: as duas do iPhone Hunter saíram com o módulo.)*

---

## Corrigido neste fechamento

| tela | coluna que nascia fora | por que importa |
|---|---|---|
| `/commissions` | **Contrato vigente** | mostra *"sem contrato"* em vermelho — quem **não pode** ser comissionado |
| `/services/manage` | **Status** | serviço inativo não entra na OS |
| `/settings/users` | **Perfil** | define o que a pessoa **pode fazer** no sistema |
| `/stock/reports` (posição) | **Status** e **Qtd** | é a resposta que um relatório de posição existe para dar |

---

## As 5 que restam — leitura honesta

**Quatro são secundárias.** A coluna decisiva já entrou; o que ficou fora é
derivado ou redundante:

| tela | fora | por quê é aceitável |
|---|---|---|
| `/cashier/history` | Saldo Inicial | a **Diferença** — que diz se fechou certo — já aparece |
| `/financial/pending` | Valor Total | **A Receber** já aparece |
| `/stock/report` | Valor Total (Custo/Venda) | totais calculados; o unitário aparece |
| `/stock/reports` | Valor Total / Unit. | idem |

**Uma é real e não foi resolvida:** `/pdv/history` ainda esconde o `Status`.

### O que tentei em `/pdv/history`

```
inicial:                Status @ 707px
após reordenar:         Status @ 393px
após ano de 2 dígitos:  Status @ 393px   (a data encolheu — o Valor entrou)
após padding px-2:      Status @ 345px
área visível:                  ~295px
```

O gargalo é o **número da venda**: `"VND202603242"` ocupa **126px** sozinho. Para
o `Status` caber, seria preciso encurtar o identificador — tirar o prefixo `VND`
ou o ano.

Isso é **mudança de dado, não de layout**, e não é decisão minha. Comprimir a
coluna à força cortaria o número, que é como o operador identifica a linha.

**Registro em vez de espremer.** Fica como decisão sua: encurtar o número da
venda na listagem (mantendo-o completo no detalhe) resolveria.

---

## Cobertura total da Etapa 9

| | |
|---|---|
| rotas em `src/app/(app)` | 124 (122 após remover o iPhone Hunter) |
| medidas a 320px | **100** |
| não medidas | 22 (rotas com `[id]`, exigem registro específico) |

As 22 restantes são telas de detalhe (`/pdv/[id]`, `/financial/[id]`,
`/stock/[id]`…). Cada uma precisa de um registro real para renderizar — medi-las
exigiria criar dado em cada módulo, o que é uma varredura própria.

---

## Guardiões desta etapa

| arquivo | asserções | visto falhar |
|---|---|---|
| `varredura-colunas-decisivas.test.ts` | 9 | 9/9 |
| `varredura-restantes.test.ts` | 8 | 7/8 |

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2.584 testes** verdes.
