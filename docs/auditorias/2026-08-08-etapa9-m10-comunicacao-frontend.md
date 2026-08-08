# Etapa 9 · Módulo 10 — Comunicação (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** `/communication`, `/communication/send`, `/communication/templates`, `/settings/whatsapp`
**Provas:** código · dado de produção · navegador real

---

## Sumário

Módulo **em uso pesado**: 1.143 mensagens WhatsApp enviadas, 43 no histórico
unificado. Zero templates cadastrados.

Dois achados corrigidos. O primeiro escondia da tela a informação que dá sentido
ao módulo; o segundo era código morto que funcionava como armadilha.

---

## CMN-1 — o histórico escondia se a mensagem chegou · **corrigido**

### O defeito

A tabela mede **906px** num contêiner de **270** a 320px. A ordem era
`Canal | Destinatario | Mensagem | Status | Data`:

| coluna | começava em | visível? |
|---|---|---|
| Canal | 25px | sim |
| Destinatario | 107px | sim |
| Mensagem | 371px | **não** |
| **Status** | **707px** | **não** |
| Data | 789px | **não** |

Para saber se a mensagem chegou, o operador precisava rolar **437px** para o
lado. Num histórico de envios, "chegou ou falhou" é a razão de a tela existir.

E a coluna na posição mais nobre era a que menos informa: `Canal` exibia
**"WhatsApp" idêntico em 100% das 20 linhas**. O filtro de canal já está logo
acima da tabela, para quem precisar separar.

Mesma classe do CMU-9 (M8), onde a coluna do valor nascia a 356px. Ali sumia
quanto o prestador ganha; aqui, se o cliente recebeu.

### A correção

`Status | Data | Destinatario | Mensagem | Canal`. Medido depois:

```
Status ->  25px  (era 707)
Data   -> 107px  (era 789)
```

O que ficou fora de vista é `Mensagem` (com `title` trazendo o texto completo) e
`Canal` — justamente o redundante.

Corrigido junto: `body.slice(0, 60) + "..."` colava reticências mesmo em
mensagem curta ("Ok...") e brigava com o `truncate`, que já corta no tamanho real
da coluna.

### O que a correção revelou

Com o Status visível, a tela mostrou **11 de 20 linhas em "Falhou"** — vermelho
em mais da metade do histórico. Medido em produção:

| mês | enviadas | falhas |
|---|---|---|
| junho/2026 | 0 | **30** |
| julho/2026 | 8 | 0 |
| agosto/2026 | 5 | 0 |

As 30 falhas são **todas** de 03/06 a 25/06. Desde 01/07 são 13 envios e **zero**
falhas — o problema foi resolvido, provavelmente quando a configuração do
WhatsApp Cloud foi ajustada.

**Não é achado ativo.** Mas 30 falhas ficaram 6 semanas invisíveis na tela feita
para mostrá-las, porque a coluna nascia a 707px.

---

## CMN-2 — dois formulários de envio, um sem validação · **corrigido**

Existiam **dois** `send-message-form.tsx`, com o mesmo nome de export
(`SendMessageForm`) e a mesma assinatura, em pastas irmãs:

| arquivo | validação | em uso? |
|---|---|---|
| `communication/_components/` | react-hook-form + **zodResolver** | **sim** |
| `communication/send/_components/` | `useState` cru, **nenhuma** | **não** |

`send/page.tsx` importa de `../_components/` — a versão validada. A outra, 95
linhas, **não é importada por ninguém**.

O risco não era teórico: trocar `../_components` por `./_components` no import
removeria toda a validação de cliente **sem erro de compilação, sem aviso de
lint, sem teste falhando**. Mesmo nome, mesma forma, comportamento diferente.

**Gravidade real, medida:** o servidor usa o **mesmo** `sendMessageSchema`
(`communication.send` → `.input(sendMessageSchema)`). Então a troca degradaria a
experiência — erro genérico do servidor em vez de aviso no campo — mas **não
abriria brecha**. Dívida e armadilha, não vulnerabilidade.

Arquivo removido.

### Validação verificada no navegador

```
campo vazio      -> "obrigatório", não envia
telefone "123"   -> "Telefone", BARRADO NO CLIENTE (nenhuma requisição sai)
```

---

## Guardião

`__tests__/unit/comunicacao-historico-colunas.test.ts` — afirma a **regra**:
informação de estado (Status, Data) antes de conteúdo (Mensagem, Canal), e Canal
por último por ser redundante.

Visto falhar antes de aceito: **6 de 7 asserções vermelhas** contra o código não
corrigido.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2522 testes** verdes.

---

## O que foi verificado e está correto

- **Reflow a 320px**: rolagem horizontal **0px** nas quatro telas
  (`/communication`, `/send`, `/templates`, `/settings/whatsapp`), nenhum
  elemento fora da viewport, nenhum erro de JS.
- **Estados vazios**: a tela de templates diz "Crie seu primeiro template", não
  uma tabela vazia sem explicação.
- **Filtros do histórico**: busca, canal e status, todos resetando a paginação
  (`setPage(0)`) — detalhe que costuma escapar e deixa o operador numa página
  que não existe mais.

---

## Registro sem proposta

### R1 — zero templates, num módulo com 1.143 envios

A tela de templates existe, funciona e nunca foi usada. As 1.143 mensagens saem
de gatilhos automáticos (OS pronta, etc.), não de modelos cadastrados.

Não é defeito. É a pergunta de produto: os templates fazem falta a alguém, ou a
tela existe para um fluxo que não se confirmou? A resposta decide entre divulgar,
documentar ou aposentar.

### R2 — 30 falhas de junho sem investigação registrada

Encerradas desde 01/07, então sem urgência. Mas não há registro do que causou nem
do que resolveu — se voltar a acontecer, a investigação recomeça do zero.

O histórico guarda o `status`, não o motivo da falha na tela. Registro porque a
decisão de expor o erro (ou não) é de produto.

---

## O que preservar

1. **Um único `sendMessageSchema` para cliente e servidor** — a validação de
   telefone que barrou "123" no cliente é a mesma que o `communication.send`
   aplica no servidor. É o que tornou o formulário morto uma dívida, e não uma
   brecha.
2. **Filtros que resetam a paginação** — `setPage(0)` em busca, canal e status.
3. **`StatusBadge` com variante por status** — "Falhou" em vermelho e "Enviada"
   em azul foi o que tornou a taxa de falha de junho legível de imediato, assim
   que a coluna entrou no campo de visão.
