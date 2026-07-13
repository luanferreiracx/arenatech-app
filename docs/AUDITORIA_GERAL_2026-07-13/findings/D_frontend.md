# D — Frontend / UX / Estado / Acessibilidade / Frame-Integrity

> Auditoria manual (agentes cortados). Foco no que o dono odeia (campos texto-livre
> que deviam ser entidade/select — como a marca que ele achou) + frame-integrity.

## D1 — Campos texto-livre que deveriam ser SELECT/ENTIDADE (o padrão que o dono odeia) — P1/P2
Mesma classe da marca do produto (já corrigida: #536/#537/#539). Encontrados MAIS:

| Campo | Onde | Devia ser | Sev |
|---|---|---|---|
| **Fornecedor** (`financial.supplier` String?) | financial/_components/transaction-form.tsx:191, financial/contas-pagar/criar:112 | Entidade Supplier (select + criar-inline, dedup) — igual marca | P1 |
| **Tipo de prestador** (Tecnico/Eletricista…) | operation/_components/service-providers-tab.tsx:115 | select de tipos (conjunto pequeno) ou entidade | P2 |
| **Condição** (novo/seminovo/usado/defeito) | sale.prisma:114, nfe-import.prisma:116 (trade-in) | **ENUM** (conjunto fechado) — não texto livre | P2 |
| **Cor / Modelo** (trade-in) | sale.prisma:138,142 | model = select do catálogo; cor = atributo/enum | P3 |
| **Motivo de ajuste/movimento** | stock/entry:121, cashier open-sessions:188 | ok como texto (é observação livre) — NÃO mudar | — |

**Impacto:** `supplier` texto livre gera duplicatas ("Fornecedor X"/"fornecedor x") em
contas a pagar/DRE por fornecedor — mesmo problema da marca, e mexe em relatório
financeiro. É o mais valioso. **Fix:** entidade `Supplier` por tenant + select+criar-inline
+ backfill dedup (mesmo playbook da marca em #536/#537). **Confiança: alta.**
Nota: `condition` como enum é trivial e de alto valor (fecha um vetor de lixo).

## D2 — Frame-integrity (design-system drift) — P3
Contagens de grep (src/app + src/components):
- **`text-[10px]` (81×) + `text-[11px]` (35×)** = 116 usos de font-size arbitrário fora
  da escala Tailwind. Fere WCAG 1.4.4 (zoom) e o "extremely professional". Deviam ser
  `text-xs`/token.
- **`bg-[#2ec4b6]` (7×), `border-[#2ec4b6]` (4×), `text-[#5eead4]` (6×)** = a cor
  primária (teal) HARDCODED em vez de `bg-primary`/token. #2ec4b6 aparece 10× total.
- **`#25D366` (5×)** = verde WhatsApp — legítimo (cor de marca), mas idealmente um token
  `--wa`. `#f97316`/`#ef4444`/`#eab308`/`#a855f7` (arco-íris) hardcoded em alguns lugares.
- `w-[200px]`/`w-[180px]`/etc. — larguras fixas arbitrárias (18+9+... ocorrências).
- 6 usos de `style={{ padding/width/... }}` inline (framing).
**Impacto:** drift do design system; não quebra função, mas fere o padrão profissional.
**Fix:** trocar text-[10/11px]→text-xs; #2ec4b6→bg-primary; extrair tokens.
**Confiança: alta** (grep exato).

## D3 — (a auditar mais a fundo)
- setState-em-effect (lint já pega no CI — provável baixo).
- Acessibilidade (teclado/ARIA/contraste) — não varri a fundo nesta passagem.
- Componentes-Deus / prop drilling — não varri.

## Boas decisões a preservar
- shadcn/ui + tokens OKLCH (globals.css) — base sólida.
- Padrão select+criar-inline para categoria/marca/atributo (agora consistente).
- Suspense/TanStack Query no fetch (não useEffect).

---
## ADENDO (verificação #10 — FALSO POSITIVO parcial)
`condition` foi re-verificado: **já é um `<Select>` na UI** (upgrade-dialog.tsx:448,
união tipada "USED"|"NEW"|"SEMI_NEW"|"DISPLAY") e o código seta com união tipada
(sale.ts:1862). Dados de prod LIMPOS (SEMI_NEW/USED/NEW, sem lixo). O `String?` no
schema é só falta de enum-no-banco, mas os valores JÁ são controlados. Converter pra
enum Prisma = baixo valor + risco de migração, sem ganho de qualidade de dados.
DECISÃO: **não fazer #10** (não é problema real). Lição: `String?` no schema não
implica UI de texto livre — verificar a UI antes de flaggar (como o audit skill manda).
