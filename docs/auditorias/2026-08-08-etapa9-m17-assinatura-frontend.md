# Etapa 9 · Módulo 17 — Assinatura (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** `/settings/subscription` · `/assinatura-bloqueada`
**Provas:** código · dado de produção · navegador real

---

## Sumário

Módulo pequeno (551 linhas) e com uma superfície de alto risco: a tela que a loja
vê **quando perde o acesso**.

Um achado — e ele é sobre a própria tela de saída virar um beco.

### O dado de produção diz outra coisa

| | |
|---|---|
| assinaturas | **1** (`demo-paybis`, R$ 299,99/mês, vence **12/08**) |
| tenants **sem** assinatura | **6** |

A única assinatura do sistema é a da **conta demo**. O `arena-tech`, que opera de
verdade, não tem. Registrado abaixo sem proposta.

---

## ASN-1 — a tela de bloqueio virava beco sem saída · **corrigido**

### O que torna isso grave

Esta tela **existe justamente para evitar um beco**. O comentário da `page.tsx`
conta a história: antes, o tenant com assinatura vencida sumia de
`availableTenants`, o proxy o mandava para `/no-access` — que dizia *"sua conta
ainda não está vinculada a nenhuma loja"* e só oferecia Sair — e a tela de pagar
era inalcançável por ser rota de tenant. O lojista ficava trancado do lado de
fora, lendo mensagem sobre outro problema.

### O defeito

Com `amountCents = 0` — assinatura sem plano, valor não definido, cadastro
incompleto — a tela:

- **escondia** a linha "Valor da mensalidade" (`amountCents > 0 &&`);
- **desabilitava** o botão (`disabled={amountCents <= 0}`);
- **não dizia nada** sobre o porquê.

Medido no navegador, com a `loja-bloqueada` e `amount_cents = 0`:

```
valor visível?      false
botão habilitado?   false
explica o motivo?   false
```

Sobrava "Pagar e reativar agora" inerte. **Um controle que não responde e não
explica recria o beco dentro da própria tela de saída.**

### A correção

O caso sem valor deixou de ser "botão desabilitado" e passou a ser uma mensagem:
diz que a mensalidade não tem valor definido, aponta o suporte, e reafirma que
dados e carteira continuam intactos — o mesmo tom do resto da tela.

```
botão morto?              0 ocorrências
explica o motivo?         sim
carteira ainda acessível? sim
reflow 320px:             rolagem 0, 0 elementos cortados
```

O caminho normal (valor > 0) segue intacto: botão habilitado, diálogo abrindo com
o valor e a exigência de CPF/CNPJ da Eulen.

---

## Guardião

`__tests__/unit/assinatura-bloqueio-sem-beco.test.ts` — 7 asserções, incluindo
três de não-regressão (carteira acessível, instrução para não-admin,
`break-words` nos parágrafos).

Visto falhar antes de aceito: **4 de 7 vermelhas**.

**Três tentativas até acertar as asserções**, todas falhando contra o código já
corrigido:

1. buscar frases no fonte cru — JSX quebra `"suporte da Arena Tech"` em duas
   linhas com indentação. Resolvido normalizando o espaço em branco;
2. janela de 700 caracteres antes do botão — não alcançava o ternário, porque o
   comentário que explica a correção fica no meio;
3. `indexOf("Pagar e reativar agora")` — a **primeira** ocorrência é o próprio
   comentário. **Terceira vez que esta armadilha aparece na Etapa 9** (M7, M13,
   M17): o texto que descreve a correção casa antes do código que a implementa.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2590 testes** verdes.

---

## O que foi verificado e está correto

A tela de bloqueio é das melhores do sistema. A 320px:

- **rolagem 0, zero elementos cortados** — `min-w-0`, `break-words` e `shrink-0`
  aplicados com cuidado em toda parte;
- **explica o que aconteceu** sem jargão: "a mensalidade venceu e o prazo de
  carência terminou";
- **tranquiliza sobre o que importa**: "sem perder nenhum dado" e "suspender a
  assinatura nunca bloqueia o seu dinheiro", com botão para a carteira DePix;
- **distingue quem pode agir**: não-admin recebe instrução ("avise quem
  administra"), não um botão que falharia.

`/settings/subscription` também passou limpa: rolagem 0, nada cortado, nenhum
erro de JS, nenhuma resposta HTTP ≥ 400.

### Um falso alarme meu

A tela mostrou "R$ 249,00" e produção tem R$ 299,99 — cheguei a suspeitar de
divergência. É o valor da `loja-bloqueada` **local**, não de produção.
Descartado.

E o regex `/R\$ 249,00/` deu falso negativo porque a formatação usa espaço
não-quebrável. O valor sempre esteve visível.

---

## Registro sem proposta

### R1 — a única assinatura do sistema é da conta demo

`demo-paybis`, R$ 299,99/mês, vencendo em **12/08 — daqui a 4 dias**. Os outros
**6 tenants não têm assinatura**, incluindo o `arena-tech`, que é a loja em
operação real.

Isso é coerente com a memória do projeto (billing manual, ADR 0058 aguardando
merge-gate), mas tem uma consequência concreta: **o caminho de cobrança nunca foi
exercitado com um cliente pagante de verdade**. O ASN-1 é um sintoma disso — um
estado que só aparece quando a assinatura existe mas está incompleta.

Não proponho porque a decisão de quando ligar a cobrança é sua.

### R2 — o vencimento da demo é em 4 dias

Se o `demo-paybis` for suspenso automaticamente em 12/08, a conta demo cai na
tela de bloqueio. Não é problema — a tela funciona —, mas convém saber antes de
mostrar a demo a alguém.

---

## O que preservar

1. **A carteira DePix nunca é bloqueada.** "Suspender a assinatura nunca bloqueia
   o seu dinheiro" — o saldo é do lojista, não garantia de pagamento. Decisão
   correta e explícita na tela.
2. **O redirect quando o bloqueio cai** (`if (!activeTenant.blocked) redirect`) —
   pagou, o webhook renovou, e a tela deixa de existir. Sem isso o lojista ficaria
   olhando um bloqueio que já não existe.
3. **`payKey` remontando o diálogo** — estado limpo a cada abertura sem effect de
   reset. Mesmo padrão em `/settings/subscription`.
4. **A distinção admin/não-admin** — quem não pode pagar recebe instrução do que
   fazer, não um botão que daria erro.
