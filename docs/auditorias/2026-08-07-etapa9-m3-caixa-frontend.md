# Etapa 9 · Módulo 3 — Caixa (frontend)

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-frontend`.

## Contexto

É onde o operador abre, movimenta e fecha a gaveta — **dinheiro físico**, com
ele contando cédulas na mão. 349 sessões em produção.

---

## E9-3 — A sangria exibia o saldo e não o usava para validar — ✅ CORRIGIDO

O diálogo **recebia** `availableBalance`, **exibia** na tela ("Saldo disponível
em dinheiro: R$ 10,00"), e validava apenas:

```ts
disabled={isPending || amount <= 0 || !description.trim()}
```

O operador digitava R$ 500 com R$ 10 na gaveta, clicava, e só então descobria.
Provado no navegador, com caixa real de R$ 10,00:

```
400 "Saldo em dinheiro insuficiente. Disponivel: R$ 10,00"
```

### O servidor sempre esteve certo

A defesa real está lá e é inegociável. O que faltava é **prevenção de erro**
(Nielsen #5) na camada onde o operador age — e a informação para barrar já
estava no componente.

### Depois do fix

```
aviso visível: "Valor acima do disponível em dinheiro (R$ 10,00)."
botão travado: true
```

Antes de qualquer chamada ao servidor. O aviso traz o **valor**, porque botão
travado sem explicação é pior que erro do servidor: o operador não sabe por que
não consegue prosseguir.

### Não é redundância

Validar nos dois lados tem propósitos diferentes: o servidor garante a
integridade do dinheiro; o cliente evita que o operador chegue a tentar. O risco
de divergir é real, e por isso o teste afirma que a UI usa **a mesma fonte**
(`summary.expectedCashBalance`), não um cálculo próprio.

---

## O que ataquei e resistiu

Este módulo é bem construído para o risco que carrega.

### Nenhum optimistic update no saldo

`grep onMutate|setQueryData` → **0 ocorrências**. Em dinheiro físico, mostrar
saldo antes do servidor confirmar induz o operador a contar errado. A ausência
aqui é **decisão**, não esquecimento — e o teste a protege.

### O fechamento tem confirmação e mostra a divergência

`ConfirmDialog` explícito, botão travado durante o envio, e a diferença entre
esperado e informado é calculada **antes** de confirmar:

```
"Saldo esperado R$ X, informado R$ Y — sem diferenca."  (ou a divergência)
```

### O CONFLICT do M7 chega ao operador

A Etapa 7 introduziu `"O caixa foi fechado por outra operação. Atualize a tela."`
O `onError` repassa `error.message` íntegro — a mensagem não morre no caminho.

### WCAG e erros de JS

| tela | 320px | 375px | 640px | erros JS |
|---|---|---|---|---|
| `/cashier` | ok | ok | ok | 0 |
| `/cashier/history` | ok | ok | ok | 0 |
| `/cashier/close` | ok | ok | ok | 0 |
| `/cashier/reviews` | ok | ok | ok | 0 |

### Frame integrity

3 arquivos com 1 valor arbitrário cada, todos layout primitivo. **Zero** `style`
inline de framing, **zero** hex solto.

### Nenhum God component

O maior é `cashier-dashboard.tsx` com **822 linhas** — menos da metade do PDV
(1.570) e da OS (1.968).

---

## Um falso positivo do meu método

Medindo sob rede lenta (2s de atraso), vi a tela mostrar só o cabeçalho e
concluí que faltava feedback de carregamento. **Errado**: existe
`CashierSkeleton` (linha 174), e minha medição capturou o instante seguinte à
primeira renderização.

---

## Registro sem proposta

Itens reais que **não** vou corrigir sem sua decisão:

1. **`cashier-dashboard.tsx` tem 822 linhas** e concentra 5 diálogos
   (abertura, sangria, suprimento, despesa, ajuste). Está no limite do
   aceitável, mas ainda legível — quebrar agora seria risco sem ganho claro.
2. **`DepositDialog` (suprimento) não valida teto**, e não deveria mesmo:
   colocar dinheiro na gaveta não tem limite lógico. Registro para deixar
   explícito que a assimetria com a sangria é **deliberada**, não esquecimento.
3. **A conferência de formas não-dinheiro** (`verified` / `reportedAmount` por
   método) é a parte mais complexa do fechamento e **não foi exercitada** — só
   li o schema.

---

## Baixa confiança

- **Não testei o fluxo completo de fechamento** com divergência real (contar
  errado de propósito e ver o que o sistema faz com a quebra).
- **Não medi WCAG 1.4.4 (zoom 200%) nem 1.4.12 (text spacing)** nas telas de
  caixa — cobri o 1.4.10.
- **`/cashier/[id]` (487 linhas) não foi aberta no navegador** — é o detalhe de
  uma sessão específica.
