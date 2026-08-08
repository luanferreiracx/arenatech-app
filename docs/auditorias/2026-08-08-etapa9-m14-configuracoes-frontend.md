# Etapa 9 · Módulo 14 — Configurações (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** as 19 telas de `/settings`
**Provas:** código · dado de produção · navegador real

---

## Sumário

O maior módulo da etapa: **33 arquivos, 5.529 linhas, 19 telas**.

Varri todas a 320px de uma vez, em vez de escolher por palpite onde procurar. O
resultado justifica o método: **um** achado real, e ele estava numa tela que eu
provavelmente não teria escolhido (configuração do bot), não nas maiores.

| | |
|---|---|
| telas varridas | 19 |
| com rolagem horizontal da página | **0** |
| com elemento fora da viewport | 0 (após filtrar falsos positivos) |
| com texto cortado | **1** |
| erros de JS | 0 |
| respostas HTTP ≥ 400 | 0 |

---

## CFG-1 — o rótulo do fuso era cortado justamente no UTC · **corrigido**

### O defeito

```
"Nordeste (Fortaleza/Teresina/Recife, UTC-3)"   283px   numa caixa de 222
gatilho mostrava:  "Nordeste (Fortaleza/Teres…"
```

O `UTC-3` ficava fora — e num seletor de fuso horário é **a única informação que
distingue uma opção da outra**. O operador escolhia às cegas.

Só um dos oito rótulos tinha o problema; os outros sete seguem `"Região (Cidade,
UTC-x)"` e cabem.

### A correção é no rótulo, não no CSS

A tela já estava correta: `min-w-0` no container, `w-full` no `SelectTrigger`.
Nenhuma largura acomoda 283px em 222 — o texto é que era longo demais.

Verificado depois: **corte 0**, UTC visível.

### A tentativa que piorou

Tentei preservar as três cidades num campo `detail` exibido só na lista aberta,
onde há espaço. **Não funciona:** o `SelectItem` do projeto envolve todo o
`children` em `SelectPrimitive.ItemText`, e o Radix copia o conteúdo inteiro para
o gatilho.

```
antes da tentativa:  corte de 61px
com o `detail`:      corte de 73px   (pior que o original)
```

Separar exigiria alterar o componente base compartilhado, o que o padrão do
projeto desaconselha. Ficou o rótulo curto.

**Perda registrada:** o rótulo não diz mais que Teresina e Recife estão no mesmo
fuso. Elas estão — quem é de lá escolhe "Nordeste" —, mas a tela não informa mais
isso.

---

## Dois falsos positivos do meu detector

Registro porque ambos custaram tempo e o segundo quase virou achado.

### 1. O `<ol>` invisível do Sonner

`/partner-api` acusou um `<ol>` de 320px terminando em 336px. Rastreei até a
origem: é o **container de toasts do Sonner**, filho direto de `<body>`, com
`offsetParent === null` — invisível ao usuário.

Meu detector varria `body *` sem filtrar visibilidade. Corrigido para ignorar
elementos ocultos, `[data-sonner-toaster]` e `nextjs-portal`. Depois do ajuste, a
varredura das 19 telas devolveu **um** achado em vez de dois.

No caminho, cheguei a suspeitar do `QueryErrorState` — componente **compartilhado**,
o que teria feito o defeito atingir toda tela com erro de carregamento. Li o
componente: está bem construído e não era ele.

### 2. "API de Parceiros não habilitada para esta loja"

Parecia erro de carregamento no recorte de texto. É **estado legítimo**: o acesso
à API externa é liberado caso a caso, e a tela explica isso com clareza.

---

## Guardião

`__tests__/unit/configuracoes-rotulos-cabem.test.ts` — 5 asserções sobre a
**classe**: nenhum rótulo de fuso passa do teto empírico de 34 caracteres, todos
mantêm o UTC, e o campo `detail` não volta (porque o Radix o copiaria para o
gatilho).

Visto falhar antes de aceito: **2 de 5 vermelhas** — as duas que descrevem o
defeito. As outras três são de não-regressão.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2564 testes** verdes.

---

## O que foi verificado e está correto

**18 das 19 telas passaram limpas** a 320px: sem rolagem horizontal, sem
elemento fora da viewport, sem texto cortado, sem erro de JS, sem resposta
HTTP ≥ 400.

Isso inclui as maiores e mais densas do módulo — `card-acquirers` (495 linhas),
`users` (481), `payment-methods` (449), `whatsapp` (420), `general` (398) e
`fiscal` (378). São telas com tabelas, formulários longos e abas, o tipo de
superfície onde os módulos anteriores acumularam defeitos.

O contraste com os módulos 8, 10 e 11 — onde a coluna decisiva nascia fora da
tela em três ocorrências seguidas — sugere que estas telas foram construídas
depois que o padrão de reflow já estava estabelecido.

---

## Registro sem proposta

### R1 — o rótulo do Nordeste perdeu Teresina e Recife

Consequência direta do CFG-1. As duas cidades estão no mesmo fuso de Fortaleza,
então a escolha certa continua sendo "Nordeste" — mas o rótulo não diz mais isso,
e um operador de Teresina pode hesitar.

Não proponho porque as saídas custam mais do que o problema: alterar o
`SelectItem` compartilhado (afeta todo o app) ou trocar por um combobox com
descrição (componente novo para um caso).

---

## O que preservar

1. **A varredura ampla antes de escolher onde olhar.** Se eu tivesse escolhido as
   telas maiores por palpite, teria auditado `card-acquirers` e `users` — ambas
   limpas — e perdido o único defeito, que estava numa tela média.
2. **`min-w-0` + `w-full` no seletor de fuso** — a tela estava certa; o defeito
   era o conteúdo. Vale registrar quando o CSS *não* é o culpado.
3. **`QueryErrorState` distinguindo três estados** — "vazio", "sem permissão" e
   "quebrou" eram a mesma tela no app; hoje um 403 não é mais lido como "nada
   para conferir".
4. **A tela de API de Parceiros explicando o gate** — em vez de esconder a
   funcionalidade ou mostrar erro, diz que o acesso é liberado caso a caso.
