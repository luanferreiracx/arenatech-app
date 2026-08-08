# Etapa 9 · Módulo 7 — Clientes (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** `/customers`, `/customers/[id]`, `/customers/[id]/edit`, `/customers/new`
**Provas:** código · dado de produção · navegador real

---

## Sumário

Um achado corrigido (E9-6) e três registrados sem proposta.

O achado não é o que eu diagnostiquei primeiro. Minha leitura inicial foi de
**vazamento de LGPD** — a ficha oferecia `wa.me` mesmo para cliente que pediu
opt-out — e o fix foi condicionar o link ao `unsubscribed`. O dono desmontou o
enquadramento em uma frase:

> *"sobre wa.me, pra que mesmo? usamos chatwoot, isso é totalmente sem sentido"*

Ele está certo, e a diferença importa. Eu tinha visto **um caso** (cliente com
opt-out) de um problema que valia para **todos** os casos: o link não deveria
existir para cliente nenhum, porque abre o WhatsApp **pessoal do operador**. O
fix por opt-out teria fechado 1 de N e deixado o resto de pé — com a agravante
de parecer resolvido.

Registro isso porque é a mesma falha de enquadramento que este programa vem
nomeando de outro ângulo (*"a correção fecha a instância, não a classe"*), só
que aqui a instância era **o meu diagnóstico**, não o código.

---

## E9-6 — a ficha do cliente só tinha o caminho ERRADO de contato · **corrigido**

### O defeito

`customer-detail.tsx` transformava os dois telefones em link:

```ts
function whatsappHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/55${digits}`;
}
```

`wa.me` abre a conversa no aparelho de quem clicou. Consequências, em ordem de
gravidade:

| efeito | por quê |
|---|---|
| conversa **fora do Chatwoot** | não entra no inbox unificado; outro atendente não vê |
| **sem registro** | `sendToCustomer` grava o envio; `wa.me` não grava nada |
| **fura o opt-out** | o `CustomerMessageDialog` respeita `unsubscribed`; o link não conhece o campo |
| **fura a janela de 24h** | a Meta só entrega texto livre dentro dela; o diálogo avisa, o link não |
| número **pessoal** | o cliente passa a ter o WhatsApp do funcionário, não o da loja |

E o mais direto: a **lista** de clientes já tinha o caminho certo
(`CustomerMessageDialog`, com gate de opt-out e aviso de janela). A **ficha** —
onde o operador passa mais tempo — só tinha o errado. Décima sexta ocorrência do
padrão: a regra existe e o irmão ficou de fora.

Isso também contradizia decisão registrada do dono (memória
`comunicacao-cliente-chatwoot`): *outbound via Chatwoot; NÃO links wa.me
pessoais*.

### Nem todo `wa.me` é errado — a direção decide

Antes de remover, classifiquei **todas** as ocorrências. Remover em bloco teria
quebrado o catálogo público:

| onde | direção | veredito |
|---|---|---|
| catálogo público, marketing, `/register/rejected` | **cliente → loja** | legítimo — o cliente não tem Chatwoot |
| `generate-link-dialog` (`wa.me/?text=`, **sem número**) | compartilhar link | legítimo — abre o seletor do sistema |
| **`customer-detail`** | **loja → cliente** | **era o único errado** |

### A correção

1. `whatsappHref` **removida**; telefone e telefone alternativo viram **texto**.
2. Botão **"Enviar mensagem"** abre o **mesmo** `CustomerMessageDialog` da lista
   — não uma cópia. Duas implementações do mesmo envio divergiriam no gate de
   opt-out, que é exatamente o defeito que estou fechando.

O telefone continua **visível**. O que sai é o convite a iniciar contato por
fora; a informação de trabalho fica (o operador precisa do número para atender
quem ligou).

### Prova no navegador

Cópia de produção, ficha de cliente real:

```
ficha:   {"linksWa": 0, "temBotaoMensagem": true, "telefoneVisivel": true}
diálogo: "Enviar WhatsApp · Para POLIANA SANTOS ROZADO ·
          Fora da janela de 24h — a Meta só entrega template aprovado."
erros JS: nenhum
```

### Guardião — `__tests__/unit/ficha-cliente-contato-chatwoot.test.ts`

Afirma a **classe**: nenhuma tela do app autenticado gera link `wa.me` **com
número**; e a ficha usa o diálogo compartilhado.

Visto falhar antes de ser aceito: **3 de 4 asserções vermelhas** contra o código
não corrigido, 4/4 verdes depois. (A quarta — "telefone continua visível" — não
distingue antes/depois; é não-regressão, não prova do fix. Registro para não
inflar o que o teste garante.)

**Calibrar o detector custou duas tentativas, ambas erradas no mesmo eixo:**

1. grep de `wa.me/[0-9$]` no arquivo → acusou o **próprio comentário** que
   explica a remoção;
2. descartar linhas iniciadas por `*` ou `//` → dentro de `{/* ... */}` do JSX
   as linhas de continuação **não têm prefixo**.

Filtrar prosa por sintaxe erra nos dois sentidos: acusa quem documenta e
deixaria passar um link real dentro de um bloco comentado. A versão final mira
só o que o navegador executa — `href=` / `window.open(` / `return ` seguido de
`https://wa.me/<número>`.

---

## Registro sem proposta

Itens reais, sem correção proposta — dependem de decisão do dono.

### R1 — a UI não permite MARCAR o opt-out

O backend tem `unsubscribeCustomer` e o `CustomerMessageDialog` **respeita** a
marca. Nenhuma tela chama a mutation.

Consequência concreta: cliente liga e pede para não receber mais mensagem, e o
operador **não tem onde clicar**. O direito existe no código e não existe no
balcão. Hoje só sai por acesso direto ao banco.

Não proponho porque envolve decisão de produto: quem pode marcar (qualquer
operador? só admin?), se registra motivo, se é reversível pela mesma tela.

### R2 — CPF e endereço completos, sem mascaramento nem trilha de acesso

A ficha mostra CPF e endereço inteiros para qualquer papel com acesso ao módulo,
e a visualização não deixa registro. Não é violação — é dado necessário ao
atendimento —, mas é a superfície de LGPD com maior volume de exposição no
sistema e hoje ninguém sabe quem consultou o quê.

Decisão de produto (mascarar parcialmente? registrar acesso? restringir por
papel?), com custo operacional real: mascarar atrapalha o atendimento.

### R3 — o botão de excluir cliente não distingue "sem histórico" de "com histórico"

O mesmo botão aparece para cliente recém-criado e para cliente com dezenas de
vendas e OS. O servidor decide; a tela não antecipa. Não gera dado errado —
gera clique que vai falhar, e o operador só descobre depois.

---

## O que preservar

1. **`CustomerMessageDialog`** — o caminho certo já existia, bem construído: gate
   de opt-out, aviso explícito da janela de 24h da Meta e envio pelo backend com
   registro. O defeito não era a ausência da solução; era ela não estar na ficha.
2. **A decisão do dono documentada no próprio componente** — o comentário no topo
   do diálogo explica *por que* conversa livre é Chatwoot e o app manda template.
   Foi o que me permitiu classificar as ocorrências de `wa.me` por direção em vez
   de remover em bloco.
3. **`formatPhone` / `formatCpf` compartilhados** — a ficha não reimplementa
   formatação de dado pessoal.
