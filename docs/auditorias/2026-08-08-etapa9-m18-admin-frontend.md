# Etapa 9 · Módulo 18 — Admin (frontend)

**Data:** 2026-08-08
**Skill:** `audit-frontend`
**Escopo:** as 11 telas de `/admin` (27 arquivos, 4.592 linhas)
**Provas:** código · dado de produção · navegador real

---

## Sumário

O painel do superadmin: tenants, planos, addons, pré-cadastros, reembolsos,
relatórios e o operacional DePix (holds, L-BTC, taxas).

Varri as 11 telas a 320px, como no M14. **Três** têm o mesmo defeito — e é a
quinta ocorrência da mesma classe nesta etapa.

---

## ADM-1 — as listas do superadmin escondiam o `Status` · **corrigido**

| tela | tabela | `Status` começava em |
|---|---|---|
| `/admin/pre-registrations` | **1199px** / 270 | **982px** |
| `/admin/tenants` | 994px / 270 | 461px |
| `/admin/reports` | 704px / 270 | 391px |

A fila de pré-cadastros é a mais grave: **seis das sete colunas fora de vista**.
É onde o superadmin decide quem entra na plataforma, e
"pendente/aprovado/rejeitado" era justamente o que não se via.

Em `/admin/reports` a ironia é maior — o quadro se chama **"Tenants por
Status"**, e `Status` era a única coluna invisível.

### Quinta ocorrência da mesma classe

| módulo | coluna escondida | começava em |
|---|---|---|
| M8 — Comissões (CMU-9) | Valor da alíquota | 356px |
| M10 — Comunicação (CMN-1) | Status do envio | 707px |
| M11 — Interesses (INT-1) | Status do lead | 475px |
| M15 — Vendas Avulsas (QSL-2) | Valor e Status | 420px / 540px |
| **M18 — Admin (ADM-1)** | **Status, em 3 telas** | **982 / 461 / 391px** |

O padrão é estável: a coluna que **decide a ação** é declarada por último e nasce
fora da tela. Sempre passa no teste de reflow da página, porque
`overflow-x-auto` é estratégia válida da WCAG 1.4.10.

### Reordenar sozinho não bastava

"Nome Fantasia" consumia **277px** (25 → 302) porque texto livre sem teto estica
a coluna — a reordenação seria desfeita pelo primeiro nome longo.

Daí o `max-w-*` + `truncate` nas colunas de texto, com `title` para o valor
inteiro continuar acessível no hover. Truncar sem `title` esconderia a informação
de vez.

Depois: `Status` em **25px** (49 em reports), corpo batendo com o cabeçalho, e a
tabela de pré-cadastros caiu de 1199px para 992px.

---

## Guardião

`__tests__/unit/admin-status-visivel.test.ts` — 6 asserções, incluindo a ordem do
corpo do relatório (HTML puro, sem `accessorKey` para proteger o alinhamento) e a
presença de `title` nas colunas truncadas.

Visto falhar antes de aceito: **6 de 6 vermelhas**.

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2596 testes** verdes.

---

## O que foi verificado e está correto

**8 das 11 telas** passaram a 320px: rolagem horizontal 0, nada fora da viewport,
nada cortado, zero erros de JS, zero respostas HTTP ≥ 400.

Isso inclui `/admin` (10 cartões), `/admin/plans` (6 cartões) e
`/admin/whatsapp-logs` (50 linhas, tabela de 363px que cabe).

### Ressalva sobre a cobertura

**Quatro telas estavam vazias** localmente — `addons`, `refunds`, `depix-holds`,
`depix-fees`. Passaram por não ter o que quebrar, não por estarem corretas.

Registro para não contar como verificadas: é a mesma armadilha do M8 (medir o mês
vazio) e do M12 (a vitrine sem fotos). Produção também tem 0 addons, mas tem
**8 pré-cadastros** — foi por isso que populei essa tela antes de medir, e foi
onde o pior caso apareceu.

---

## Registro sem proposta

### R1 — quatro telas do admin sem dado para exercitar

`addons` (0 em produção), `refunds`, `depix-holds` e `depix-fees` não puderam ser
medidas com conteúdo real. Não sei dizer se estão corretas sob carga.

Não proponho porque criar dado sintético em cada uma daria uma auditoria própria;
registro para que a próxima varredura saiba que essas quatro ficaram descobertas.

---

## O que preservar

1. **`title` nas colunas truncadas** — o valor inteiro volta no hover. Truncar sem
   isso seria trocar transbordo por perda de informação.
2. **O tipo inferido por documento** (ADR 0050) — sem CPF = NO-KYC, com um badge
   que diz isso na lista. Regra de negócio visível onde o superadmin decide.
3. **`StatusBadge` com variante por estado** — ativo/suspenso/bloqueado em cores
   distintas foi o que tornou a correção imediatamente legível.
4. **A tabela de `whatsapp-logs` cabendo em 363px** com 50 linhas — quatro
   colunas enxutas, prova de que o padrão certo já existe no próprio módulo.
