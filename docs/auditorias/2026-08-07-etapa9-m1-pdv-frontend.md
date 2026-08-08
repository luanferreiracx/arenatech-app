# Etapa 9 · Módulo 1 — PDV (frontend)

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-frontend`.

## Por que esta etapa existe

O dono perguntou se `/audit-frontend` e `/audit-backend` foram rodadas em cada
módulo. **Não foram.** Medindo:

| etapa | `audit-backend` | `audit-security` | `audit-frontend` |
|---|---|---|---|
| Etapa 7 (9 módulos) | 2 | 0 | **0** |
| Etapa 8 (10 módulos) | 3 | 6 | **0** |

Rodei **uma** skill por módulo, escolhida por mim — não foi o que o comando
pedia. Consequência concreta: os 22 achados do módulo-a-módulo são **todos de
backend**. A camada que o operador toca nunca teve auditoria própria.

A Etapa 9 corrige isso, começando pelo PDV: **2.555 vendas, R$ 7,5 milhões**, e
a tela onde o operador passa o dia.

---

## E9-1 — O quinto estado centrado que escapou — ✅ CORRIGIDO

O **PR #573** (14/07) trocou `h-[calc(100vh-80px)]` por
`min-h-[calc(100dvh-80px)]` nos estados centrados do PDV. A razão está escrita
lá: **`100vh` desalinha no Safari iOS** — a barra de URL entra e sai da conta.

Corrigiu 4 de 5. O quinto — `draftRetailBlocked`, a tela "Venda livre não está
no seu plano" — é estado centrado idêntico aos outros e ficou de fora.

**Décima quinta ocorrência** do padrão: a regra existia e foi esquecida no irmão.

### Duas coisas erradas na mesma linha

```
h-[calc(100vh-80px)]   →   min-h-[calc(100dvh-80px)]
```

- **`vh` → `dvh`**: no iOS, `vh` mede a viewport sem a barra de URL, que aparece
  e some ao rolar. `dvh` acompanha.
- **`h-` → `min-h-`**: altura fixa **corta** quando o conteúdo cresce — com
  tradução mais longa, fonte aumentada ou o override de text-spacing do
  WCAG 1.4.12. `min-h-` centraliza e acomoda.

### O guardião fecha a classe

O teste afirma que **nenhuma tela do app** usa `100vh`, com a lista derivada do
código — uma lista à mão foi exatamente como o quinto caso escapou em julho.

Duas exclusões deliberadas, documentadas no teste: `global-error.tsx` (roda
quando o React quebra, não pode depender do Tailwind) e `docs/partner-api`
(página estática fora do app).

**Também mergeei o #573**, aberto e verde desde 14/07 — quase um mês parado.

---

## O que ataquei e resistiu

O PDV é mais sólido do que a auditoria de 04/08 sugeria.

### WCAG: passa nos três critérios

Medido no navegador, não inferido:

| critério | teste | resultado |
|---|---|---|
| 1.4.10 (reflow 320px) | overflow horizontal | **nenhum** (320/320) |
| 1.4.10 (375px, iPhone SE) | overflow horizontal | **nenhum** (375/375) |
| 1.4.4 (zoom 200%) | overflow a 640px | **nenhum** |
| 1.4.12 (text spacing) | elementos com texto cortado | **0 reais** |

### Duplo clique em finalizar: protegido em três camadas

O risco clássico de PDV — clicar duas vezes e vender duas vezes:

```
452:  if (finalizeMutation.isPending) return;              // guarda no handler
641:  disabled={finalizeMutation.isPending}                 // botão travado
692:  disabled={finalizeMutation.isPending || isAutoFinalizing}
```

### Estados de erro: cobertos

12 queries/mutations, **15 `onError`** e **16 `toast.error`**. A auditoria de
04/08 registrou `isError: 0` no sistema; aqui o tratamento é explícito e por
chamada.

### Sem erro de JS nem de hidratação

Carregado como operador: **0 erros de página, 0 no console, 0 avisos de
hidratação** no log do dev server.

---

## Achados descartados

1. **"11 valores arbitrários de Tailwind"** — a contagem assusta e não é
   defeito. São `calc()` de viewport, `min-w-[32rem]` em tabela e `text-[10px]`
   em `<kbd>` — layout primitivo, que a própria skill isenta. **A memória do
   projeto já registra**: contar classe no fonte não mede layout.
2. **"1 elemento corta texto sob WCAG 1.4.12"** — é `sr-only`, invisível por
   definição, existe só para leitor de tela. Falso positivo do meu detector.

## Dois erros meus no teste-guardião

- O grep de `100vh` **casava dentro de `100dvh`** — acusava as próprias linhas
  corrigidas. Corrigido com `[^d]100vh`.
- A asserção de `min-h` pegava o `lg:h-[calc(100dvh-80px)]` do grid de duas
  colunas, que é **legítimo**: prende a altura só no desktop para as colunas
  rolarem por dentro. Excluí prefixos de breakpoint.

Nos dois casos o teste **falhou com o fix aplicado** — foi rodá-lo nas duas
direções que pegou.

---

## Baixa confiança

- **Não testei o fluxo de venda ponta a ponta** (buscar produto → carrinho →
  pagamento → finalizar) com o carrinho preenchido. Testei o carregamento, o
  reflow e as guardas do botão.
- **Não auditei `payment-dialog.tsx` (1.092 linhas) por dentro.** É o segundo
  maior componente e onde o dinheiro entra; verifiquei as guardas de duplo
  clique, não a lógica de estado.
- **`pdv-screen.tsx` tem 1.570 linhas, 12 `useState` e 6 `useEffect`.** É um God
  component pela definição da skill. Não propus quebrá-lo: refactor desse
  tamanho na tela de maior volume do sistema é risco que não se toma numa
  auditoria — é projeto à parte, com sua decisão.
