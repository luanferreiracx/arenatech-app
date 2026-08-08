# ADR 0070 — Remoção do módulo iPhone Hunter

**Data:** 2026-08-08
**Status:** Implementado
**Decisão do dono:** *"esse módulo de busca de iphones será descontinuado. não iremos mais usar"*

---

## Contexto

O iPhone Hunter monitorava grupos de WhatsApp via Evolution API, parseava
anúncios de iPhone (modelo, armazenamento, condição, preço) e os listava para
garimpo. Introduzido pelo [ADR 0044](0044-iphone-hunter-central-tenant.md), com
acesso restrito ao tenant `arena-tech`.

**Nunca foi usado.** Medido em produção antes da remoção:

| tabela | registros |
|---|---|
| `iphone_listings` | **0** |
| `whatsapp_groups` | **0** |
| `whatsapp_group_messages` | **0** |

Zero dado a preservar, zero a exportar.

---

## O que foi removido

| item | arquivos |
|---|---|
| telas | `src/app/(app)/iphone-hunter/` (2 páginas + 2 componentes) |
| router tRPC | `src/server/api/routers/iphone-hunter.ts` |
| parser | `src/lib/services/iphone-listing-parser.ts` + seu teste |
| schema | `prisma/schema/whatsapp-group.prisma` (3 modelos + 1 enum) |
| tabelas | migration `20260808120000_remove_iphone_hunter` |
| referências | `root.ts`, `nav-items.ts`, `breadcrumb.tsx`, `modules.ts`, `dashboard-content.tsx` |

---

## O que foi PRESERVADO (e por quê)

### O webhook do Evolution continua vivo

`/api/webhooks/evolution` tinha **duas responsabilidades independentes**:

1. `messages.update` — atualizar o status das mensagens que a loja **envia**
   (SENT → DELIVERED → READ → FAILED). **Fica.**
2. `messages.upsert` — capturar anúncios em grupos monitorados. **Sai.**

Só o segundo ramo foi removido (87 linhas), junto com o import do parser.
Verificado no navegador depois: o webhook responde `200 {ok:true,matched:false}`.

Remover o arquivo inteiro teria quebrado o rastreamento de entrega de mensagem —
que é o que alimenta o histórico de comunicação.

### O mecanismo de gating por slug

`SLUG_RESTRICTED_ROUTES` ficou **vazio** — o iPhone Hunter era o único usuário.
O mecanismo permanece porque o buraco que ele fecha é real: rota que não casa
nenhum prefixo de módulo passaria livre por URL, ainda que o menu a escondesse
(`requiresTenantSlug` some do menu, não bloqueia a rota).

O teste que guardava esse comportamento foi **reescrito**, não apagado: em vez de
afirmar o caso específico (`/iphone-hunter` só para `arena-tech`), afirma a
**regra** — rota fora de qualquer módulo é negada por padrão, inclusive para o
tenant de acesso total.

---

## A migration

Escrita **à mão**, não gerada. O `prisma migrate dev` pediu reset do banco por
causa de três migrations antigas alteradas por outra sessão — reset está na
denylist e apagaria dados de teste.

```sql
DROP TABLE IF EXISTS "iphone_listings";
DROP TABLE IF EXISTS "whatsapp_group_messages";
DROP TABLE IF EXISTS "whatsapp_groups";
DROP TYPE  IF EXISTS "IPhoneCondition";
```

Ordem: filhas antes das mães. Verificado em `pg_constraint` que **nenhuma tabela
de fora do conjunto** referencia estas três — o DROP não cascateia.

`IF EXISTS` porque o CI monta o banco do zero e ambientes antigos podem não ter
as tabelas.

**Testada num banco limpo** (o que o CI faz): todas as migrations aplicaram, as 3
tabelas sumiram, 123 tabelas restantes, enum removido.

---

## Verificação

```
/iphone-hunter        -> redireciona para /painel?error=modulo-indisponivel
menu e painel         -> não citam mais "Buscar iPhones"
webhook evolution     -> 200 {"ok":true,"matched":false}
erros JS              -> nenhum
```

`pnpm lint` 0 erros · `pnpm typecheck` limpo · **2.576 testes** verdes.

---

## Consequências

- **Reversível com custo.** Voltar exige recriar schema, migration, router,
  telas e o ramo do webhook. Como as tabelas estavam vazias, não há dado
  histórico a recuperar — o custo é de código, não de informação.
- **O ADR 0044 fica como registro histórico**, não como decisão vigente.
- **Uma auditoria evitada.** A varredura da Etapa 9 tinha achado a coluna `Preço`
  fora de vista nesta tela (574px numa área de 270). Cheguei a corrigir e
  **reverti** ao saber da descontinuação: polir tela que sai é trabalho perdido, e
  o comentário que eu havia escrito ("existe para garimpar aparelho") passaria a
  mentir no código.
