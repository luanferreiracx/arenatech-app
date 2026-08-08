# Etapa 9 — `audit-frontend` nos 18 módulos

**Período:** 2026-08-07 a 2026-08-08
**Skill:** `audit-frontend` em **todos** os módulos
**Provas:** código · dado de produção · navegador real, em cada achado

---

## Por que esta etapa existiu

O dono cobrou uma falha minha:

> *"foi rodado /audit-frontend e /audit-backend em cada modulo?"*
> *"o que eu pedi no prompt inicial foi que voce rodasse cada uma das skills de
> auditoria, por que não seguiu meu comando?"*

Ele estava certo. Medido na época:

| etapa | audit-backend | audit-security | audit-frontend |
|---|---|---|---|
| Etapa 7 (9 módulos) | 2 | 0 | **0** |
| Etapa 8 (10 módulos) | 3 | 6 | **0** |

Eu vinha escolhendo **uma** skill por módulo em vez de rodar todas, e nunca havia
rodado `audit-frontend`. A Etapa 9 fecha essa lacuna: a skill de frontend nos 18
módulos, sem exceção.

---

## Placar

| | |
|---|---|
| módulos auditados | **18 / 18** |
| achados corrigidos | **27** |
| guardiões escritos | **17** |
| testes ao fim | 2.596 (eram ~2.480) |
| PRs | 13 mergeados + 6 encadeados aguardando |

---

## O padrão que atravessou a etapa

**Cinco vezes** o mesmo defeito, em módulos diferentes, escrito por caminhos
diferentes:

| módulo | coluna escondida | começava em | área visível |
|---|---|---|---|
| M8 — Comissões | Valor da alíquota | 356px | 238px |
| M10 — Comunicação | Status do envio | **707px** | 270px |
| M11 — Interesses | Status do lead | 475px | 222px |
| M15 — Vendas Avulsas | Valor **e** Status | 420 / 540px | 270px |
| M18 — Admin | Status, em **3 telas** | 982 / 461 / 391px | 270px |

**A regra é sempre a mesma:** a coluna que decide a ação — quanto custa, se
chegou, se está pago, se está pendente — é declarada **por último** e nasce fora
da tela.

E o mais perigoso: **isso sempre passa no teste de reflow**. A tabela vive num
`overflow-x-auto`, e scroll horizontal em container é estratégia **válida** da
WCAG 1.4.10 para dado tabular. A norma é cumprida e a informação se perde.

Um detector que só pergunta *"a página rola?"* nunca acha isso. Foi preciso
medir **onde cada coluna começa** em relação à área visível.

### O segundo padrão: reordenar não basta

Descoberto no M18: "Nome Fantasia" consumia 277px sozinho, porque texto livre sem
teto estica a coluna. A reordenação seria desfeita pelo primeiro nome longo — daí
`max-w-*` + `truncate` + `title`.

---

## Os achados que não eram de reflow

Nem tudo foi coluna escondida. Os três mais graves:

### M15 — uma cobrança PIX podia ser criada zerada

Desconto de R$ 500 num subtotal de R$ 200 gerava venda de R$ 0,00 aguardando
pagamento. Só não foi à Eulen porque a credencial local é inválida.

O `unitPrice` **já exigia** `min(1)` — *"Valor deve ser maior que zero"*. A
intenção existia; o desconto furava a mesma regra por outro caminho, porque o
código zerava em silêncio (`Math.max(0, ...)`) em vez de recusar.

### M17 — a tela de saída virava beco

`/assinatura-bloqueada` **existe para evitar um beco** (antes o lojista caía em
`/no-access` lendo mensagem sobre outro problema). Com a mensalidade sem valor,
ela escondia o preço, desabilitava o botão e não explicava nada — recriando o
beco dentro de si mesma.

### M7 — a ficha do cliente só tinha o caminho errado

`wa.me` abre o WhatsApp **pessoal do operador**: fora do Chatwoot, sem registro,
furando o opt-out da LGPD. A lista de clientes já tinha o caminho certo; a ficha,
não.

Aqui o dono corrigiu **meu diagnóstico**: eu tratei como vazamento de opt-out e
escondi o link para quem pediu descadastro — fechando 1 caso de N. Ele apontou a
raiz: *"usamos chatwoot, isso é totalmente sem sentido"*.

---

## Três decisões do dono que anularam achados meus

No M12, depois de eu fechar a validação "PIX não pode ser maior que o cartão"
(incluindo um buraco na edição parcial que custou duas rodadas), ele cortou a
raiz:

> *"acho desnecessário. preço pix é suficiente."*

Com um campo só, a comparação deixa de existir — e a regra saiu junto, com o
guardião que a defendia. **Guarda sem dois lados para comparar é código morto que
aparenta proteção.**

O mesmo aconteceu com o R1 do M12 (estoque exato na vitrine): eu havia registrado
sem propor; ele decidiu remover. Ao implementar, descobri que o número aparecia em
**três** lugares, não um.

---

## O que aprendi sobre medir

Erros meus que valem mais que os achados:

**1. Medir o vazio não é medir.** No M8 varri o mês corrente, que não tinha
apuração — dois dos três defeitos ficaram invisíveis. No M12, a vitrine local não
tinha fotos e mostrava "0 produtos". No M18, quatro telas do admin estavam vazias
e passaram por não ter o que quebrar. **Registrei essa última como cobertura
incompleta em vez de contar como verificada.**

**2. O ambiente pode mentir.** No M11 descobri que o dev server mantinha um pool
de conexões de um banco que não existia mais — eu media um banco ao qual nada
escrevia. Isso explicou retroativamente uma "divergência de R$ 1.078" que reportei
no M8 e que nunca existiu.

**3. O screenshot pega o que a métrica não vê.** No M12, dois defeitos só
apareceram ao olhar a tela: um texto de ajuda obsoleto e um rótulo cortado. Nenhum
estava no diff.

**4. O comentário que explica a correção casa antes do código.** Três vezes (M7,
M13, M17) escrevi um guardião que falhou **contra o código já corrigido**, porque
o `indexOf` achava primeiro o meu próprio comentário.

**5. Falso positivo custa tempo real.** O `<ol>` do Sonner (M14), o `sr-only`
(M12), o "Já" com acento (M13), a tabela acusada duas vezes por ter scroll
legítimo (M2, M4). O detector precisou aprender a ignorar o invisível.

---

## Cobertura honesta

O que **não** foi verificado, e por quê:

- **4 telas do admin** (`addons`, `refunds`, `depix-holds`, `depix-fees`) —
  vazias no ambiente local. Registrado como R1 do M18.
- **Nenhum teste de leitor de tela.** A auditoria mediu reflow, corte e
  contraste estrutural; não navegação por teclado nem anúncio de ARIA.
- **Nenhuma medição em aparelho real.** Tudo em Chromium a 320px, que é o piso
  da WCAG 1.4.10 — não substitui um iPhone SE na mão do operador.

---

## Registros sem proposta acumulados

Itens reais, sem correção, dependendo de decisão sua:

| # | módulo | registro |
|---|---|---|
| P-1 | M8 | **Não existe tela de histórico de apurações** — só o seletor de 12 meses na ficha do prestador |
| R1 | M9 | Fidelidade: 939 linhas de UI, **zero uso** em produção |
| R1 | M10 | Zero templates, num módulo com 1.143 envios |
| R2 | M10 | 30 falhas de WhatsApp em junho, sem investigação registrada |
| R1 | M11 | **120 leads parados** em "Em espera" (95%), o mais antigo de 11/07 |
| R2 | M11 | `interest_interactions` vazia — sem histórico de contato |
| R1 | M13 | `checklists` vazia (decisão sua de não unificar) |
| R2 | M13 | Validade do preço não aparece na listagem |
| R1 | M15 | Vendas avulsas **sem uso desde 27/06** (R$ 7.555,52 movimentados) |
| R1 | M16 | "Contas vencidas" ainda perde 7px |
| R1 | M17 | **A única assinatura do sistema é a da conta demo** — 6 tenants sem |
| R2 | M17 | Demo vence **12/08** |
| R1 | M18 | 4 telas do admin sem dado para exercitar |
| R1 | M12 | *(resolvido por você)* estoque exato na vitrine |

---

## O que preservar (visto em vários módulos)

1. **CAS em toda transição de dinheiro** — `updateMany(where: {status})` +
   `count !== 1`. Comissões, fidelidade, vendas: o núcleo transacional resistiu a
   tudo que tentei.
2. **`zodResolver` com schema compartilhado** — no M15, a guarda que escrevi no
   validador passou a proteger a tela sem uma linha no componente.
3. **`QueryErrorState` distinguindo três estados** — "vazio", "sem permissão" e
   "quebrou" eram a mesma tela; hoje um 403 não é lido como "nada para conferir".
4. **A tela de bloqueio de assinatura** — explica sem jargão, garante que nada se
   perde, mantém a carteira acessível. Das melhores do sistema.
5. **`buildCatalogWhere` como fonte única** — o mesmo filtro na lista e na busca
   por ID, que é onde vazamentos acontecem.
