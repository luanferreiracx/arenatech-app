# Auditoria de Frontend/UX — PDV, OS e Estoque (2026-08-04)

> **STATUS: os 4 P0 e boa parte dos P1 foram corrigidos** no PR #809. O que
> sobrou está em "Ainda pendente", no fim do plano.
>
> Duas correções só apareceram na validação em NAVEGADOR, não na leitura do
> código:
>
> 1. Na auto-revisão, eu tinha trocado um `w-[180px]` por `w-[11rem]` — ainda um
>    valor arbitrário. Virou `w-44`, da escala.
> 2. O primeiro conserto do item da OS estava **incompleto**: com tudo na mesma
>    linha, as ações `shrink-0` não deixavam largura para o texto e a 320px a
>    descrição quebrava com **uma letra por linha** — pior que o problema
>    original. Só ficou visível ao abrir a tela com uma OS de texto longo real.
>
> É o argumento prático para o que a skill `empirical-validation` diz: revisar o
> diff prova que o código faz o que diz, não que a tela funciona.

> Primeira auditoria de FRONTEND do projeto. As 15 anteriores olharam backend,
> dinheiro e domínio; nenhuma tinha perguntado se o **operador** consegue usar o
> sistema. Escopo: as telas que a loja usa o dia inteiro.
>
> Protocolo: `audit-frontend` (4 rodadas), 3 agentes em paralelo + verificação
> pessoal (leitura do código e **navegador real**) de todo achado P0/P1 citado.
> Nenhum arquivo foi modificado.

## Sumário executivo — os 5 maiores riscos

| # | Risco | Efeito no operador | Sev |
|---|---|---|---|
| 1 | Falha no auto-finalize deixa dinheiro recebido sem venda registrada | Cobra o cliente 2x | P0 |
| 2 | Esc/clique-fora no QR DePix **depois** de pago descarta o pagamento | Cobra o cliente 2x | P0 |
| 3 | Tela de OS fica em esqueleto pulsando **para sempre** quando a query falha | Trava sem explicação | P0 |
| 4 | Query falha e a tabela afirma "Nenhuma compra registrada" | Acha que os dados sumiram | P0 |
| 5 | Baixa de estoque e remoção de item de OS sem confirmação nenhuma | Perde mercadoria num clique | P1 |

O padrão: **o backend foi endurecido a cada auditoria; a camada de UI que
comunica o resultado ao operador, não.** Onde o servidor está certo e a tela
mente, quem paga é o operador — e o dono, que ouve a reclamação.

Os dois primeiros têm a mesma raiz e são a coisa mais grave aqui: **o estado de
"pagamento confirmado" vive só no `useState` de um componente React.** Todo o
resto do fluxo de dinheiro é reconciliado contra o servidor; este ponto não é.
Qualquer Escape, F5 ou oscilação de rede apaga.

---

## P0 — Dinheiro e dados

### P0-1 — Auto-finalize falha: dinheiro entrou, venda não existe
`payment-dialog.tsx:520-526`

```ts
onError: (err) => {
  toast.error(
    options?.auto
      ? `${autoLabel} confirmado, mas a finalizacao falhou: ${err.message}. Tente confirmar novamente.`
      : err.message,
  );
},
```

Cliente paga o PIX, o SSE confirma, o `finalize` morre (Wi-Fi do balcão, servidor
lento). **O dinheiro entrou na conta da loja. A venda continua `DRAFT`.**

O operador vê um toast vermelho que some em segundos. O leg do DePix existe só em
`useState`: fechar o dialog, apertar F5 ou reiniciar a venda **evapora a prova de
que o cliente pagou**. Sob pressão, o reflexo é "deu erro, vou refazer" — e
refazer é cobrar de novo.

É a mesma classe do incidente de saque duplicado já registrado na memória do
projeto: timeout comeu a resposta, o app gravou o estado pessimista, o operador
pagou duas vezes.

### P0-2 — Esc no QR depois de pago cancela o pagamento
`depix-qr-dialog.tsx:182` + `:78-83`

```ts
<Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
```

`handleCancel` dispara `cancelPix` **em qualquer estado**, inclusive
`status === "paid"`. O comentário no código assume que fechar significa "cliente
não pagou" — premissa falsa depois da confirmação.

Cenário: pagamento confirma, o finalize é lento (o servidor faz HTTP externo
antes da transação), a tela mostra "Pagamento confirmado! Fechando...", o
operador impaciente aperta Escape. Cancela um pagamento que já entrou.

O guard `paidFiredRef` protege contra confirmar duas vezes; **não** protege
contra cancelar depois de confirmar.

### P0-3 — Esqueleto eterno na OS (verificado no navegador)
`service-order-detail.tsx:292-294` e `service-orders/[id]/edit/page.tsx:88-90`

```ts
if (isLoading || !order) {
  return <div className="animate-pulse ..." />;
}
```

Query falha → `isLoading=false`, `order=undefined` → a condição continua
verdadeira. `retry` é 2 e desligado para 4xx, então **nada resolve**.

**Medido ao vivo:** abri uma OS inexistente e, 9 segundos depois, a tela seguia
com 1 esqueleto pulsando, `MOSTRA_ERRO: false`, nenhum texto de erro. Sem número
de OS, sem botão de tentar de novo, sem explicação.

`stock/[id]/page.tsx:60-66` separa `isLoading` de `!product` corretamente — o
padrão certo já existe no repo.

### P0-4 — Tabela afirma que não há dados quando a query falhou
`purchases-table.tsx:302`, `movements-table.tsx:167`

```ts
data={(data?.data ?? []) as PurchaseRow[]}
emptyMessage="Nenhuma compra registrada."
```

**`isError` aparece 0 vezes** nos módulos de OS e Estoque (verificado por grep).
O toast global dispara, mas some; o que fica na tela é uma **afirmação sobre o
negócio**: "nenhuma compra registrada". Num sistema de estoque, afirmar que o
dado não existe é pior que admitir incerteza.

---

## P1 — Proteção desproporcional e estado

### P1-5 — Ações que mexem em estoque sem confirmação nenhuma
- `stock/exit/page.tsx:63-82` — **baixa de estoque** vai do submit direto ao
  `mutate`. Sem preview do tipo "vai sair N, restam Y". O
  `adjust-stock-dialog.tsx:148-152` já faz esse preview — o padrão bom existe e
  não foi aplicado na ação mais destrutiva.
- `service-order-detail.tsx:867` — **remover item da OS** é um clique num ícone
  fantasma pequeno, colado no ícone de editar. No servidor isso libera estoque,
  grava `StockMovement`, apaga a linha e recalcula totais. Sem confirmação, sem
  undo, e a descrição/preço digitados não voltam.

Contraste: `Excluir OS` tem diálogo bem escrito. A ação que mexe em inventário,
não.

### P1-6 — Estorno de OS não diz o que vai acontecer
`service-order-detail.tsx:1618-1627` mostra só um Textarea de motivo. O servidor
(`service-order.ts:1330-1375`) bloqueia se houver NF-e ativa, **exige caixa
aberto porque gera saída na gaveta**, estorna recebíveis e comissões.

O operador não tem como saber que uma retirada de caixa está prestes a ser
registrada. `sale-detail.tsx:805-880` faz certo (checkbox por item, "estorno
parcial: N de M", "devolver itens ao estoque") — o time sabe fazer.

### P1-7 — Segunda aba apaga o carrinho da primeira
`pdv-screen.tsx:161` chama `abandonDraft` no mount, e `abandonDraft` apaga
**todos** os rascunhos do vendedor (`sale.ts:543-583`). Abrir o PDV numa segunda
aba mata o carrinho da primeira.

A aba 1 não descobre: `refetchOnWindowFocus: false` (`:203`). Ela segue mostrando
8 itens que não existem mais no banco.

### P1-8 — `addItem` sem trava: 5 cliques rápidos furam o estoque
`pdv-screen.tsx:406-424` não tem guard de `isPending` (o finalize tem três). A
checagem local lê `items` do draft, que só atualiza depois do refetch. Cinco
cliques em 300ms leem o mesmo valor velho.

O servidor barra no finalize, então não vira venda fantasma — mas o operador só
descobre no fim, com o cliente na frente, e precisa desmontar o carrinho.

### P1-9 — Cliente selecionado otimista, sem reversão
`pdv-screen.tsx:550-562` grava `setCustomerId(id)` antes da mutação e nunca
reverte no erro. `canFinalize` passa a mentir: a tela mostra o cliente e o botão
habilitado, o servidor não tem cliente na venda, e o `finalize` recusa **depois**
que o operador montou o pagamento inteiro.

### P1-10 — Reiniciar venda com rede ruim trava a tela
`pdv-screen.tsx:631-641` zera `draftId` antes de confirmar e usa `onSuccess`
(não `onSettled`) para recriar. Se o abandon falha, fica sem draft e sem erro:
todo produto novo cai em "Aguarde o rascunho ser criado", e clicar em Reiniciar
de novo repete o buraco. O `initDraft` do mesmo arquivo faz certo com `onSettled`.

### P1-11 — Categorias somem depois da 50ª
`categories/page.tsx:34` não passa paginação, o servidor usa `pageSize ?? 50` e a
tela **não tem controle de página**. A categoria 51 existe no banco e é
inalcançável pela UI.

### P1-12 — Relatórios sem `take` e sem virtualização
`stock/report/page.tsx:25` chama `inventoryReport` sem argumentos; o servidor faz
`findMany` **sem `take`** e o cliente renderiza tudo. Idem `reportPosicao`,
`reportEstoqueMin`, `reportCurvaAbc` e mais 5 abas. As **listas** estão
paginadas em 10 (corretas); o problema é nos relatórios. Com 5.000 produtos, o
DOM explode.

`movimentacoes-tab` tem `take: 500` no servidor mas a UI nunca diz que truncou —
500 linhas ao lado de totais calculados sobre tudo.

### P1-13 — 147 `<Label>` órfãos
`FormLabel` (38 usos) liga certo via `form.tsx:101`. Mas 147 `<Label>` puros não
têm `htmlFor` nem envolvem o input — são irmãos. Leitor de tela anuncia o campo
sem nome; clicar no rótulo não foca. Piores: `service-order-detail.tsx` (23),
`suppliers/new` (14), `suppliers/[id]/edit` (14).

---

## P2 — Menores, mas reais

- **37 containers de texto dinâmico sem estratégia de overflow** (`line-clamp-*`
  = 0 no escopo). Pior: `service-order-detail.tsx:853-861` — descrição longa
  empurra os **botões de ação** para fora do card. `device-history-panel.tsx:68`
  clampa o mesmo campo corretamente: inconsistência dentro do próprio módulo.
- **Correntes de `min-w-0` quebradas** (truncate ghost):
  `select-stock-item-dialog.tsx:126-130` tem `min-w-0` no wrapper e perde um
  nível abaixo; `products-table.tsx:164-171` sem `min-w-0` ao lado de thumb
  `shrink-0`.
- **74 larguras fixas** `w-[Npx]`/`min-w-[Npx]`. Consequência medida: a **lista
  de OS estoura 37px em 320px** (`scrollW=357`), causada pelos filtros de data
  `w-[150px]`. PDV, Estoque e Caixa passam em 320px.
- **7 botões só-ícone sem nome acessível** (de 74; 67 corretos). Inclui
  `depix-qr-dialog.tsx:255`, que copia o código PIX — controle do caminho do
  dinheiro sem rótulo.
- **Sem skip link**, `sr-only` = 0 no escopo: quem usa teclado tabula a sidebar
  inteira em toda página.
- **Alvos de toque de 24-28px** (`h-7 w-7`) nos controles mais tocados do PDV
  (+/- quantidade, remover item) e da OS. Mínimo recomendado: 44px. Numa tela
  declaradamente de tablet, com "remover" colado em "diminuir".
- **Sem rascunho/autosave em nenhum formulário longo.** `purchases/new` (743
  linhas, ~20 campos) descarta tudo num clique em Cancelar; o wizard de OS
  guarda os 5 passos em um `useState` — fechar a aba no passo 4 perde tudo.
- **Confirmações anônimas que mentem sobre reversibilidade**:
  `categories/page.tsx:228` e `brands/page.tsx:241` dizem "não pode ser desfeita"
  — o servidor faz **soft delete** — e nunca dizem QUAL registro.
  `attributes/page.tsx:374` já é o template certo.
- **Diálogo de cancelamento destruído ao abrir o termo de devolução**
  (`service-order-detail.tsx:1509-1516`): o invariante "um diálogo por vez"
  fecha o de cancelamento e o motivo digitado fica órfão.
- **`isTechnician` não é usado em nenhuma tela.** O técnico vê a superfície
  inteira do operador (Receber Pagamento, Termos, Estornar, Cancelar), enquanto
  os dois controles que ele de fato usa são ícones fantasma sem rótulo. O
  mecanismo para resolver já existe e está sem uso.

---

## Decisões boas, que devem ser preservadas

1. **Disciplina de tokens.** ZERO valores arbitrários de espaçamento/cor
   (`p-[13px]`, `bg-[#1a1a1a]`) em todo `src/app` + `src/components`. Os 89 hex
   estão em rotas de PDF e SVG de logo, onde CSS token não se aplica. Raro.
2. **Acessibilidade de base intacta.** Zero `<div>` clicável, zero override de
   ARIA do Radix, zero `outline-none`, zero fonte em px literal. O foco do Radix
   está preservado porque ninguém mexeu — a melhor forma de acertar.
3. **Status nunca é só cor.** `StatusBadge` sempre renderiza texto junto. O item
   "sinal só por cor" da checklist **não** se confirma.
4. **Trava de duplo-clique no finalize em três camadas** + CAS no servidor. O
   caminho mais crítico do dinheiro está certo.
5. **O input de quantidade do carrinho** (`pdv-screen.tsx:1075-1106`) é o melhor
   componente da tela: re-sincroniza, seleciona ao focar, comita em Enter/blur e
   reverte quando o servidor recusa. É o padrão de reconciliação que falta nos
   outros pontos.
6. **`use-active-dialog.ts`** trocou 17 booleanos por um estado só, tornando
   "um diálogo por vez" um invariante estrutural. Refactor real, já feito.
7. **Tratamento global de erro de query** (`trpc/react.tsx:46-73`) com toast +
   Sentry e 4xx classificado como resposta de negócio (sem spam, sem retry).

---

## Plano priorizado

**Quick wins (baixo risco, alto retorno)**
1. `handleCancel` vira no-op quando `status === "paid"` e o Dialog trava o
   dismiss — fecha P0-2.
2. Estado bloqueante e persistente quando o auto-finalize falha: banner fixo
   "Pagamento de R$ X recebido, venda não registrada" + Cancelar desabilitado —
   fecha P0-1.
3. Separar `isLoading` de `!order` nas duas telas de OS, com estado de erro e
   botão de tentar de novo — fecha P0-3.
4. `isError` no `DataTable` (o componente já aceita `emptyState` como nó) —
   fecha P0-4.
5. Confirmação com preview em `stock/exit` e na remoção de item de OS.
6. `w-[150px]` → largura fluida nos filtros de data da lista de OS (fecha o
   estouro de 320px).

**Quick wins 1-6: TODOS FEITOS** (PR #809). Os 4 P0 estão fechados.

**Estruturais**
7. Codemod dos 147 `<Label>` órfãos para `htmlFor`/`FormLabel`. **PENDENTE.**
8. ~~`min-w-0` + `break-words` nas caixas de texto livre~~ **FEITO onde mais
   doía**: a linha de item da OS (que escondia os botões de ação) e os três
   campos de texto livre do diagnóstico. As outras ~30 caixas seguem pendentes.
9. ~~Preview de efeitos no estorno de OS~~ **FEITO**, em paridade com o da venda.
10. ~~Guard de `isPending` no `addItem`; `onSettled` no reiniciar venda;
    reverter `setCustomerId` no erro~~ **FEITO** (PR #811). O remover cliente
    nem tratava erro — agora reverte os três campos.
11. `take` + aviso de truncamento nos relatórios de estoque. **PENDENTE.**
12. ~~Paginação em categorias~~ **FEITO**. Em MARCAS não era preciso: verifiquei
    que `listBrands` não pagina (sem `take`), então nada ficava escondido — a
    hipótese da auditoria não se confirmou ali.
13. ~~Alvos de toque nos itens de OS (28px → 36px)~~ **FEITO**. No carrinho do
    PDV segue **pendente**.

**Também feito, fora da lista original**
- Confirmações anônimas de categoria/marca que ainda MENTIAM sobre
  reversibilidade (dizem "não pode ser desfeita", mas o servidor faz soft
  delete). Agora nomeiam o registro e descrevem o efeito real.

**Perigosas — DECIDIDAS E FEITAS (PR #811)**
14. ~~Revalidar o draft ao focar a aba~~ **FEITO** (decisão do dono). O
    NOT_FOUND virou tela específica: "Esta venda foi encerrada / o PDV foi
    aberto em outra aba", com botão **Começar nova venda** — em vez de um
    "tentar novamente" que nunca funcionaria, porque o rascunho não volta.
15. ~~Reduzir a superfície do técnico~~ **FEITO como MODO BANCADA** (decisão do
    dono: configurável por usuário). Campo próprio `benchModeOnly`, **não**
    derivado de `isTechnician` — em loja pequena o técnico às vezes também
    atende o balcão. Nasce desligado; o admin liga por usuário, e a opção só
    aparece para quem é técnico. Esconde cancelar, estornar, o passo de
    pagamento e o bloco de comunicação; mantém diagnóstico, itens e status.
    **Não é permissão** — o servidor continua barrando quem não pode.

## Backlog — FECHADO no PR #813

- ~~**`<Label>` órfãos**~~ **FEITO: 329 → 59.** A contagem real era 329, não 147
  (o levantamento original olhou só parte do escopo). Ligados por codemod em
  três passadas conservadoras: `Input` (134), `Textarea` (49), `Select` (42,
  com o id no `SelectTrigger`, que é quem recebe o foco) e inputs custom que
  espalham `...props` (45).

  Os 59 restantes envolvem componentes que ainda **não encaminham `id`**
  (Switch, Checkbox, EntitySelector, Controller): exigem mudança de assinatura,
  não codemod. Cobertos por um **teste-teto** que impede o número de subir.

  Criado o `<Field>` (`components/domain/forms/field.tsx`): gera o id com
  `useId()` e o entrega ao filho, então a ligação não depende de ninguém
  lembrar do `htmlFor`. É o caminho para campos novos.

  Medido no navegador: `/settings/general` foi a **zero** campos sem nome
  acessível; `/stock/suppliers/new` e `/stock/exit`, de 2 para 1.
- ~~**Relatório de estoque sem `take`**~~ **FEITO.** Teto de 1.000 linhas, com
  os **totais** ainda calculados sobre a base inteira (cortar antes
  contaminaria o resumo, que é o dado que o dono usa) e o truncamento
  **declarado** na tela.
- ~~**Alvos de toque do carrinho do PDV**~~ **FEITO: 28px → 36px**, com o input
  de quantidade acompanhando para não desalinhar a linha.

**Ainda aberto** (menor severidade, sem prazo):

- **~30 caixas de texto livre** sem estratégia de overflow. As que escondiam
  botão foram corrigidas; as restantes só esticam layout.
- **Sem rascunho/autosave** nos formulários longos (compra de aparelho, wizard
  de OS): fechar a aba no meio perde o preenchimento.
- **NF-e ignora produto serializado em silêncio** e ainda o conta como importado.

## Lições de processo desta rodada

Três defeitos passaram pela leitura do código e só apareceram ao abrir a tela ou
rodar o CI. Vale registrar o padrão:

1. **`w-[11rem]`** — troquei um valor arbitrário por outro arbitrário na própria
   auto-revisão. Pegou no grep de frame-integrity, não na leitura.
2. **Item da OS quebrando com uma letra por linha a 320px** — o primeiro
   conserto (`min-w-0` + `shrink-0`) deixou o texto sem largura. Overflow media
   0; a tela estava absurda. **Medir não basta: é preciso olhar.**
3. **`benchModeOnly` sumindo no refresh do JWT** — o login trazia a flag, o
   refresh não a remapeava. Typecheck passava (campo opcional). Só apareceu
   logado como técnico, vendo o botão "Cancelar" que deveria ter sumido.

E um quarto, no CI: um teste de concorrência de cashback falhou **sem relação
com o diff**. Era flaky por construção — afirmava QUAL guarda disparou
(implementação) em vez do comportamento. Corrigido para aceitar as duas formas
corretas de o perdedor da corrida terminar, mantendo a checagem que importa
(não vazar erro de banco). Verificado 6x seguidas.

## Baixa confiança / perguntas em aberto

- Não testei com leitor de tela real (NVDA/VoiceOver). Os achados de a11y são
  por código e por DOM renderizado, não por escuta.
- Não medi performance com 5.000 produtos — a conclusão sobre relatórios vem da
  ausência de `take`/virtualização no código, não de profiling.
- Zoom 200% e o override de espaçamento de texto (WCAG 1.4.12) não foram
  medidos ao vivo; só o reflow de 320px foi.
- O impacto real dos P0 de pagamento depende de quanto o DePix é usado no dia a
  dia. Mensurável.
