# ADR 0053 — Autonomia do operador: redesenho da linha admin/operator

**Status:** aceito
**Data:** 2026-06-18
**Revisa parcialmente:** ADR 0020 (RBAC de catálogo), ADR 0024 (RBAC de estoque), ADR 0031 (RBAC de caixa — só contexto).

## Contexto

Os RBACs de estoque/catálogo (0020/0024) foram desenhados para **4 papéis**:
`operator` (vendedor read-only) → `technician` → `manager` (gerente do dia a dia)
→ `owner`. As matrizes davam ao **manager** o poder operacional (entrada de
estoque, compra de aparelho, fornecedores).

Em 13/jun (#89/#90) o modelo foi colapsado para **2 papéis de privilégio**
(`admin | operator`) + flags de função (`isTechnician`, `isCashier`). O colapso
foi assimétrico: `owner` **e** `manager` viraram `admin`; `vendedor`/`technician`/
`cashier` viraram `operator`. Consequência não intencional: **todo o poder de
"gerente de balcão" subiu para `admin`** e o operador ficou preso no nível
"vendedor read-only". Na prática a loja não funcionava — o funcionário comum não
conseguia dar entrada de estoque, registrar compra nem cadastrar fornecedor.

## Decisão

Manter o modelo binário `admin | operator` e **redesenhar a linha**: as ações do
dia a dia descem para `operator`; `admin` fica com curadoria de catálogo, perda
de patrimônio e o que é financeiro/sensível.

Fonte única em `src/lib/auth/capabilities.ts` (`can()`), consumida pela UI via
`use-capabilities` (`useCan`). No servidor, capacidades de operador = ausência de
gate (a `tenantProcedure` já garante o vínculo); capacidades de admin seguem com
`isTenantAdmin`.

### Matriz (estoque / compras / fornecedores)

| Ação | Operator | Admin |
|------|----------|-------|
| Entrada / saída avulsa / ajuste de inventário / ajuste em massa | ✓ | ✓ |
| Entrada serializada / por quantidade | ✓ | ✓ |
| Marcar defeito / devolvido / reativar item | ✓ | ✓ |
| Registrar compra de aparelho | ✓ | ✓ |
| Importar produtos via CSV | ✓ | ✓ |
| Cadastrar / editar fornecedor | ✓ | ✓ |
| **Criar/editar/excluir produto, categoria, atributo, variação, foto** | ✗ | ✓ |
| **Baixa/descarte (writeOff/dispose) e bloquear item** (perda de patrimônio) | ✗ | ✓ |
| **Excluir fornecedor** | ✗ | ✓ |
| **Cancelar compra / alterar data da compra** | ✗ | ✓ |

Inalterado (seguem admin/dono): avaliação de troca, aprovar despesa, categorias
financeiras, estorno de parcela, alterar venda finalizada, forçar fechamento /
ajuste manual de caixa, excluir/restaurar cliente, comissões, configurações.

## Justificativa

- "Operador" no Arena Tech é o funcionário comum (não um vendedor restrito): para
  a loja girar ele precisa do back-office do dia a dia.
- O colapso 4→2 jogou o nível "gerente" para `admin`; este ADR corrige onde a
  linha foi traçada, sem reintroduzir um terceiro tier (mantém o modelo binário).
- **Movimento ≠ perda.** Entrada/saída/ajuste/defeito são movimento auditado
  (todo `StockMovement` grava `userId`). Baixa/descarte/bloqueio são perda
  irreversível de patrimônio — continuam com o dono.
- **Curadoria do catálogo** (criar/editar produto) fica com o dono; o operador
  movimenta saldo dos produtos existentes. (Compra e CSV podem criar produto como
  efeito colateral — aceito, são fluxos operacionais explicitamente liberados.)

## Alternativas descartadas

- **Reintroduzir tier `manager` (3 papéis):** reverteria a consolidação de 13/jun
  (migration, enum, JWT, UI) por ganho marginal — o pedido era "operador com mais
  autonomia", não "um vendedor restrito + um gerente".
- **Permissões granulares por usuário (flags):** over-engineering para o porte
  atual; pode ser revisitado se uma loja pedir granularidade por pessoa.

## Consequências

- Operador passa a ver e usar as ações de estoque/compra/fornecedor na UI.
- Deixa de existir um "vendedor read-only" — qualquer membro do tenant movimenta
  estoque. Aceito (auditado por `userId`).
- Outros routers ainda usam `isTenantAdmin` direto (correto, sem mudança de
  comportamento). Migração deles para `can()` é cleanup futuro opcional.
