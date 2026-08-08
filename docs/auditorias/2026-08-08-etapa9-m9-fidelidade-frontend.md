# Etapa 9 · Módulo 9 — Fidelidade (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** `/fidelidade` (abas Submissões e Campanhas), painel na ficha do cliente, resgate no PDV
**Provas:** código · dado de produção · navegador real

---

## Sumário

**939 linhas de UI, 4 tabelas, 0 registros em produção.** Um mês depois de o
módulo ter sido construído (#685-#690), a fidelidade nunca foi usada:

| tabela | registros |
|---|---|
| `reward_campaigns` | **0** |
| `reward_actions` | **0** |
| `reward_balances` | **0** |
| `reward_movements` | **0** |

Isso mudou o que a auditoria procurou. Medir reflow numa tela que ninguém abre
tem pouco valor; o que importa é saber **se ela funciona quando alguém abrir**.
Percorri o fluxo inteiro no navegador — criar campanha, listar, aprovar,
resgatar na venda — porque esse caminho nunca foi percorrido por ninguém.

Um defeito encontrado e corrigido, exatamente no primeiro passo desse caminho.
O reflow a 320px passou limpo nas duas abas.

---

## FDU-3 — criar a primeira campanha jogava o operador para a aba errada · **corrigido**

### O defeito

O FDU-2 (auditoria anterior) resolveu o problema certo: sem campanha, abrir em
"Campanhas" em vez de mandar a loja esperar submissões que nunca virão. Mas
resolveu com um estado que se **movia**:

```ts
const tab = tabEscolhida ?? (semCampanha ? "campanhas" : "submissoes");
```

`tabEscolhida` só deixa de ser `null` quando alguém **clica** numa aba. Até lá o
valor é derivado de `semCampanha` — que muda sozinho no instante em que a
primeira campanha nasce. A aba saltava debaixo do operador.

### Medido no navegador

```
criar a 1ª campanha -> aba SALTA para "Submissões", lista vazia:
                       "quando um cliente publicar, a submissão aparece aqui"
                       (a campanha recém-criada em lugar nenhum)
criar a 2ª campanha -> aba PERMANECE em "Campanhas"
```

A segunda medição isola a causa: com `tabEscolhida` já preenchido, o salto some.
O defeito existe **só no primeiro contato da loja com o módulo**.

É o pior momento possível. A loja configura o programa pela primeira vez, aperta
"Criar", e cai numa tela vazia mandando esperar clientes publicarem. A leitura
natural é *"não salvou"* — e quem está nesse momento é justamente quem tem menos
repertório para concluir o contrário. Com 0 campanhas em produção, **toda** loja
que abrir a fidelidade passa por aqui.

### A correção

O padrão da aba é decisão de **abertura**, não função do estado atual: congela na
primeira resposta e não se mexe mais. A escolha explícita do operador continua
tendo precedência.

### Uma tentativa errada no caminho

A primeira versão usou `useRef` — typecheck limpo, guardião verde, navegador
correto. **O lint reprovou com 5 erros** (`react-hooks/refs`: escrever e ler ref
durante o render quebra com o React Compiler). Trocado por `useState` com
inicialização condicional.

Vale registrar porque as três verificações que eu tinha rodado passaram; foi a
quarta que pegou. Guardado no próprio teste (`não usa useRef`).

### Guardião

`__tests__/unit/fidelidade-aba-nao-salta.test.ts` — 5 asserções. Visto falhar
antes de aceito: **4 de 5 vermelhas** contra o código não corrigido.

O teste lê o código em vez de renderizar, e isso é deliberado: o projeto **não
tem nenhum teste de componente** (`vitest.config` roda em ambiente `node`).
Introduzir jsdom e uma convenção nova para guardar um achado deste tamanho seria
desproporcional — a prova de comportamento é a medição no navegador; o teste
guarda a decisão estrutural que a sustenta.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **248 arquivos / 2506 testes** verdes.

---

## O que foi verificado e está correto

Registro o que **não** virou achado, com o que sustenta cada descarte.

### Resgate no PDV — sólido, inclusive num detalhe fino

`applyRewardDiscount` faz CAS `APPROVED→USED` (`updateMany` + `count !== 1`
abortando), valida venda `DRAFT`, recompensa `APPROVED`, expiração, e nunca
desconta mais que o subtotal.

O detalhe que merece nota: grava o desconto como **fixo em centavos**, não como
percentual. O comentário explica — guardar percentual faria o `recalculateSale`
recalcular sobre um subtotal futuro diferente e **mudar o desconto sozinho**. É o
tipo de erro que só aparece semanas depois, num caso específico.

O `RewardRedeemDialog` também está bem construído: `min-w-0` na cadeia flex,
`truncate` no nome da campanha, `shrink-0` no botão, e aviso explícito de que a
recompensa **substitui** o desconto manual (decisão do dono).

### Aprovação de submissão — CAS presente

`approveAction` faz `updateMany(where: { status: "PENDING" })` com
`count !== 1` abortando. Clique duplo não gera recompensa dobrada.

### Reflow a 320px — limpo

Ambas as abas: rolagem horizontal **0px**, nenhum elemento fora da viewport,
nenhum transbordo de texto. O único transbordo medido é o placeholder da paleta
de comandos, que não é renderizado ao usuário.

### Ausência de "excluir campanha" — decisão, não lacuna

A UI oferece ativar/desativar mas não excluir. O router **não tem**
`deleteCampaign` — só `toggleCampaign`. Campanha com histórico de submissões não
deve sumir; é modelagem consciente. Descartado.

---

## Registro sem proposta

### R1 — o módulo inteiro está sem uso

939 linhas de UI, 16 procedures no router, 4 tabelas — e **zero** de tudo em
produção, um mês depois de pronto.

Não é defeito. Mas é o dado mais importante deste módulo, e as saídas são de
produto: o programa não foi divulgado às lojas? não faz sentido para o negócio
delas? falta um passo de configuração que ninguém sabe que existe? A resposta
muda o que fazer com o código — evoluir, documentar ou aposentar.

O FDU-3 é uma pista concreta: se alguém **tentou** e a tela pareceu não salvar,
isso explicaria uma desistência silenciosa. Não tenho como provar que aconteceu —
com 0 campanhas, não há rastro de tentativa.

### R2 — aprovar/rejeitar não desabilita durante o envio

Os botões da fila de submissões desabilitam por `!isAdmin`, mas não por
`isPending`. O clique duplo é barrado no servidor (CAS), então **não gera
recompensa dobrada** — o segundo clique recebe erro.

Fica um incômodo de UI: o operador vê uma mensagem de erro por ter clicado duas
vezes numa ação que funcionou. Registro sem propor porque é polimento, e o risco
de dinheiro já está coberto.

---

## O que preservar

1. **CAS em toda transição de estado da recompensa** — `PENDING→APPROVED` na
   aprovação, `APPROVED→USED` no resgate. As duas com `count !== 1` abortando.
   Recompensa é dinheiro; o módulo tratou como tal desde o início.
2. **Desconto gravado como valor fixo, não percentual** — impede o recálculo
   futuro de alterar o desconto sozinho.
3. **O aviso de substituição no resgate** — a venda tem um único slot de
   desconto, e a tela diz isso antes de o operador aplicar, não depois.
4. **A regra do FDU-2** — sem campanha, abrir em Campanhas. O acerto era o
   diagnóstico; só a implementação precisou mudar.
