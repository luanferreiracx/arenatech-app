# Etapa 7 · Módulo 6 — Relatórios

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-06.

## Superfície

Pequena: 1 procedure tRPC (`nfReport`) e 2 rotas REST que geram arquivo
(`/api/reports/[type]/pdf`, `/api/reports/stock/[type]`).

Rota que gera arquivo com dado de tenant é onde IDOR e vazamento moram — foi por
aí que comecei.

---

## M6-1 — Operador baixa em PDF o custo que a tela esconde dele — ✅ CORRIGIDO

O relatório de posição de estoque renderiza a coluna **Custo** e o **total
imobilizado**. A rota tinha os guards de sessão, tenant e módulo — **nenhum de
papel**.

### Provado no navegador, antes do fix

| perfil | HTTP | coluna Custo | tamanho |
|---|---|---|---|
| admin | 200 | **sim** | 183 KB |
| operador | 200 | **sim** | 183 KB |

Bytes idênticos. **A política de custo já existia dos dois lados:** `stock.ts:237,283`
omite `costPrice` do produto para não-admin, e o detalhe da OS esconde custo do
operador (verificado no M1 desta mesma etapa). O relatório era a porta dos
fundos: **a tela nega, o PDF entrega**.

### Exposição medida em produção

786 produtos, **R$ 38.507** de custo total do estoque, com **2 operadores reais**
no tenant.

### O fix: negar o custo, não a ferramenta

Bloquear o relatório inteiro seria mais fácil e pior — conferir estoque é
trabalho do operador. A coluna e o total saem só para admin; o resto do relatório
continua igual.

Verificado depois do fix:

| perfil | coluna Custo | relatório gerado | tamanho |
|---|---|---|---|
| admin | **sim** | sim | 183 KB |
| operador | **não** | **sim** | 159 KB |

### É a oitava vez

Mesmo padrão que esta auditoria vem encontrando: **a correção fecha a instância,
não a classe.** A regra de custo foi aplicada no produto, na OS e no PDV — e não
no relatório.

O teste afirma a **regra**, não o caso: qualquer rota de relatório que renderize
`costPrice` sem checar `isTenantAdmin` quebra.

---

## O que verifiquei e está correto

- **As duas rotas REST têm o padrão completo**: `auth()` → `resolveActiveTenant`
  → `isModuleAllowedForTenant` → `withTenant`
- **401 sem sessão** nas duas, testado em produção
- **`take: 1000`** no relatório de estoque — não é dump ilimitado

## Baixa confiança

- **Não auditei os outros dois tipos de relatório** (`nf`, `technician`) com a
  mesma profundidade — verifiquei que não renderizam `costPrice`, mas não medi
  que outros campos sensíveis podem carregar.
- **Não testei os relatórios da rota `/api/reports/stock/[type]`** no navegador;
  o grep confirmou que ela não renderiza custo, então o gate novo não se aplica.
