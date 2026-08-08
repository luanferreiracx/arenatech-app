# Etapa 9 · Módulo 6 — Estoque (frontend)

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-08. Skill: `audit-frontend`.

## Escala

**25 telas** — a maior superfície do sistema. 786 produtos, R$ 38.507 de custo.

---

## E9-5 — `/stock/nfe` rolava 50px por causa de um input nativo — ✅ CORRIGIDO

Varrendo as 16 telas principais a 320px, **uma** rolava:

```
/stock/nfe rola 50px — INPUT.mx-auto
```

### A armadilha

`input[type="file"]` tem **largura intrínseca**. O Chrome a calcula pelo texto
do botão ("Escolher arquivo") mais o rótulo do arquivo, e **ignora o
container**:

```
w=361px  right=436  viewport=320  maxWidth=none
```

`mx-auto` — a classe que estava lá — centraliza, mas não limita.

### Por que só este ponto quebrou

O app tem **6** inputs de arquivo. Cinco estão seguros:

| arquivo | por quê |
|---|---|
| `variation-images-panel.tsx` | escondido (acionado por botão) |
| `photo-gallery.tsx` | escondido |
| `logo-upload.tsx` | escondido |
| `stock/import/page.tsx` | usa `<Input>` do shadcn |
| `service-orders/[id]/edit` | usa `<Input>` do shadcn |
| **`stock/nfe/page.tsx`** | **`<input>` nativo, sem limite** |

O componente `<Input>` do shadcn já traz `w-full min-w-0` — quem o usa está
protegido de graça. **O defeito era o único ponto que escapou do design
system**, e o teste afirma a regra com esse critério: escondido, ou `<Input>`,
ou largura limitada.

### Verificado

| viewport | rola? | largura do input | clicável |
|---|---|---|---|
| 320px | **0** | 170px | sim |
| 375px | **0** | 225px | sim |
| 640px | **0** | 361px | sim |
| 1280px | **0** | 361px | sim |

Encolhe com o container e continua utilizável. E as **16 telas** terminaram com
0 rolagem a 320px.

---

## O que verifiquei e está correto

### A política de custo do M6 funciona na tela

O M6 da Etapa 7 fechou o custo no PDF. A tela sempre esteve certa, e continua:

| papel | coluna "Custo" | valores |
|---|---|---|
| ADMIN | presente | `R$ 25,00` · `R$ 15,00` · `R$ 16,00` |
| OPERADOR | presente | `-` · `-` · `-` |

A coluna existe para os dois — o **valor** só para quem pode. Mantém o layout
estável entre papéis, sem revelar nada.

E `/stock/report` (o relatório de posição) **não mostra custo ao operador**,
coerente com o PDF corrigido.

### Zero erros de JS

12 combinações (6 telas × 2 papéis): nenhum erro de página, nenhum no console.

---

## Registro sem proposta

1. **`purchases/new/page.tsx` tem 776 linhas** — é o maior do módulo e um
   formulário de compra com múltiplas etapas. Confortável para o que faz; não
   proponho quebrar.
2. **`/stock` tem 25 telas**, mais que qualquer outro módulo. Auditei **16**;
   as 9 restantes são detalhe/edição de entidades já cobertas
   (`[id]`, `[id]/edit`, `suppliers/[id]`, etc.). Não é lacuna de risco, é
   escolha de cobertura.
3. **A tabela de produtos mostra a coluna "Custo" mesmo para quem vê `-`.**
   Uma alternativa seria ocultar a coluna inteira, como o PDF faz. Manter a
   coluna preserva o alinhamento visual entre papéis e evita que o operador
   estranhe uma tela "diferente"; ocultar seria mais limpo. **Decisão sua** —
   as duas defendem o dado igualmente.

---

## Baixa confiança

- **Não exercitei entrada/saída de estoque de verdade** — testei que as telas
  carregam e cabem em 320px, não o fluxo de movimentação.
- **Não medi WCAG 1.4.4 (zoom 200%) nem 1.4.12 (text spacing)** — cobri o
  1.4.10 nas 16 telas.
- **`/stock/import` (384 linhas) não foi exercitada com CSV real.** É o caminho
  de importação em massa, e importação mal testada é onde dado sujo entra.
