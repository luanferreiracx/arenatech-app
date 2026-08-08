# Etapa 9 · Módulo 5 — Carteira DePix (frontend)

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-frontend`.

## Escala

517 transações, **R$ 159.687** movimentados. É onde a UI mexe com **cripto —
irreversível**. Oito telas.

---

## Sem achados. É o módulo mais bem construído da Etapa 9.

Registro o que resistiu, porque num fluxo irreversível o contraponto vale tanto
quanto o defeito.

### O gate de saque nega e EXPLICA

As três telas de saque, com operador:

```
/depix-wallet/withdraw            → "Saque disponivel apenas para perfil admin
                                     do tenant. Seu perfil pode consultar a
                                     carteira, mas nao pode iniciar saques.
                                     Solicite a um usuario com perfil admin..."
/depix-wallet/withdraw-external   → nega, 0 botões
/depix-wallet/withdraw-onchain    → nega, 0 botões
```

Não é tela quebrada nem 403 seco: diz **o que fazer em seguida**. É a diferença
entre bloquear e orientar.

### A validação de saldo informa o BRUTO, não o líquido pedido

Testado com saldo R$ 0,00, pedindo R$ 100:

```
"Saldo insuficiente. Necessario R$ 101,00 pra esse valor liquido."
```

Informa **R$ 101,00** — o valor com a taxa. O operador que lê "preciso de R$ 100"
e tem R$ 100,50 entenderia errado. Este texto não deixa.

E nenhum botão de avanço aparece nesse estado.

### O step-up 2FA do E8-10 chegou à UI

A correção da Etapa 8 (revelar a seed exige 2FA) está na tela:

```
campo 2FA presente: true
campo senha presente: true
botão travado: true
```

Os dois campos obrigatórios, botão desabilitado até ambos preenchidos.

### Nenhum optimistic update

`grep onMutate|setQueryData` nas 8 telas → **0**. Em cripto, mostrar saldo antes
da confirmação é pior que no caixa: a transação não volta.

### Fluxo em etapas, com contexto sempre visível

O saque é um wizard: destinatário → valor → confirmação. Na etapa do valor, o
cabeçalho mostra **os três limites juntos**:

```
Min R$ 10,00 · Max R$ 5.000,00 · Saldo R$ 0,00
```

Mais atalhos (R$ 50 / 100 / 250 / 500 / 1.000). O operador não precisa lembrar
de nada.

### WCAG e erros de JS

**14 combinações** (7 telas × 2 papéis): zero rolagem horizontal, zero erro de
JS, zero tela quebrada.

### Nenhum God component

O maior é `withdraw/page.tsx` com **685 linhas** — menos da metade do PDV
(1.570) e da OS (1.968), e é um wizard de 3 etapas.

---

## Registro sem proposta

1. **`transactions/[id]/page.tsx` usa 23 valores arbitrários de Tailwind**,
   concentrados em `text-[10px]` e `tracking-[0.2em]`. Medido no navegador:
   **11 elementos renderizam abaixo de 11px**.

   A WCAG não define tamanho mínimo de fonte, e são **rótulos secundários**
   ("Recebimento PIX", "Resumo financeiro") — não valores nem ações. Mas 10px é
   reconhecidamente desconfortável, e a escala do Tailwind começa em `text-xs`
   (12px) justamente por isso.

   Não proponho mudar: é decisão estética consistente na tela inteira, e alterá-la
   muda a densidade visual do detalhe de transação. **Sua chamada.**

2. **`_components/balance-hero.tsx` tem 6 valores arbitrários** — é o cartão de
   saldo, com tipografia deliberadamente maior. Mesma natureza do item 1.

3. **A tela `/depix-wallet/setup` não nega ao operador** — mas mostra "Carteira
   já configurada", porque não há o que provisionar. Se um tenant novo entrar
   sem carteira, essa tela precisa ser reavaliada; hoje o caso não existe.

---

## Baixa confiança

- **Não completei um saque real.** Testei as barreiras (papel, saldo, taxa,
  2FA), não a transação — e não faria isso em produção com cripto.
- **Não testei `/depix-wallet/receive` com QR gerado** nem o fluxo de link de
  pagamento ponta a ponta.
- **Não medi WCAG 1.4.4 (zoom 200%) nem 1.4.12 (text spacing)** — cobri o
  1.4.10 nas 7 telas.
- **`byow-wallets-card.tsx` (274 linhas) não foi exercitado**: exige um tenant
  com carteira própria, e só 2 têm.
