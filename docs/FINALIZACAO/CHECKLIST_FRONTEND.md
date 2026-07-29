# Checklist — passada de frontend

> Aplicado igual em todo módulo, **no navegador rodando contra dados reais** —
> não por leitura de código. É esta passada que existe porque as auditorias
> anteriores não a fizeram.

Antes de começar: `pnpm tsx scripts/audit/crawl-module.ts <modulo>` e triar o
`report.json`. O crawler acha o barato (erro de console, 4xx/5xx, tela vazia,
overflow); o resto é olho humano.

## 1. Erro visível

- Query que falha mostra **erro**, não "R$ 0,00" nem tabela vazia. Zero e falha não podem ser indistinguíveis.
- Mutação que falha mostra a mensagem de negócio do servidor.

## 2. Estados de carregamento

- Skeleton/`Suspense` some quando a query resolve **ou falha** — skeleton eterno é o sintoma clássico de erro engolido.
- Botão fica `disabled` enquanto pendente, com rótulo de progresso.
- Diálogo fecha no `onSuccess`, nunca no clique.

## 3. Invalidação

- Depois de criar/editar/cancelar, o número na tela muda **sozinho**, sem F5.
- Badge e contador que vivem no layout também revalidam (o "Caixa aberto" do PDV já mentiu por isso).

## 4. Estado vazio

- Lista vazia diz o que é e oferece a ação seguinte.
- Estado vazio ≠ estado de erro ≠ estado sem permissão. Os três são telas diferentes.

## 5. Permissão

- Como **operador**: o que some do menu, o que fica desabilitado, o que a rota bloqueia por URL direta.
- Rota que o operador não pode ver deve **redirecionar ou explicar** — não renderizar meia tela presa em 403.
- Custo e margem não aparecem para quem não pode ver.

## 6. Formatação pt-BR

- Todo campo de dinheiro usa `MoneyInput` (acumula dígito cru, formata só na saída).
- Data em BRT.
- Número em coluna com `tabular-nums`.

## 7. Mobile (390 px)

- Sem overflow horizontal.
- Tabela vira card ou rola de propósito.
- Ação principal alcançável sem zoom.

## 8. Acessibilidade

- Todo campo com label associado.
- Foco visível e ordem de tab coerente.
- Diálogo devolve o foco ao fechar.
- ARIA/`role` do Radix intactos.

## 9. Reconciliação tela × banco

- Para cada número exibido, rodar a query equivalente e comparar. Divergência é achado, não arredondamento.
- Conferir também o **recorte**: soft-delete, cancelado, fuso, e se o card e o gráfico da mesma tela usam a mesma definição.

## 10. Console e rede

- 0 erro de console.
- 0 request 4xx/5xx que não seja estado de negócio tratado e **visível na tela**.

## 11. Fluxo incompleto

- Botão que não faz nada, link morto, tela órfã do menu, feature meia-implementada.
- Decisão explícita: **completar ou remover**. Deixar como está não é opção — é isso que faz o dono achar bug depois.

## Fechamento

- [ ] Crawler rodado nas 4 combinações (admin/operador × desktop/mobile)
- [ ] Cada fluxo do módulo percorrido à mão: criar, editar, cancelar, estornar, imprimir, exportar
- [ ] Reconciliação feita e registrada
- [ ] E2E `@business` novo cobrindo o fluxo principal
- [ ] `pnpm test:e2e` verde
