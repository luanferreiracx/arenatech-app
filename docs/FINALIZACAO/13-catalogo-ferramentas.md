# Módulo 13 — Catálogo / Ferramentas

**Passada A (backend):** concluída em 2026-07-31.
**Passada B (frontend):** pendente.

## Superfície

| | |
|---|---|
| Routers | `catalog.ts` (1.200, 36 procedures), `valuation.ts` (426, 12), `simulator.ts` (316, 4), `search.ts` (111, 1) |
| Serviço | `public-catalog.ts` — catálogo anônimo, multi-tenant por subdomínio |
| Borda anônima | `GET /api/catalog/public`, páginas `(public)/catalog` e `(public)/catalog/[id]` |
| Telas internas | `/aparelhos-catalogo`, `/simulator`, `/valuations`, `/imei` |

## O que a produção diz (medido em 2026-07-31)

| | |
|---|---|
| Serviços | 117 |
| Aparelhos no catálogo | 103 |
| Categorias | 11 |
| Avaliações de aparelho | 232 |

Tudo no `arena-tech`; os outros seis tenants têm zero. Módulo em uso real.

## Achado

### CT-1 — o catálogo público servia o tenant errado (P2)

`getPublicCatalog` trata `tenantSlug` como **fonte primária** do tenant e, sem
ele, cai no padrão (`DEFAULT_TENANT_ID` / `DEFAULT_TENANT_SLUG` / `arena-tech`).
Esse fallback é deliberado: existe para o host legado
`catalogo.arenatechpi.com.br`, que é de um tenant só.

As **páginas** fazem certo — `(public)/catalog` e `(public)/catalog/[id]` leem
`x-catalog-tenant-slug`, que o proxy injeta no rewrite do subdomínio.

A **rota REST** `GET /api/catalog/public` não passava nada. E não passava por um
motivo estrutural: o proxy só reescreve `/` e `/catalog*`; **`/api/*` é isento de
propósito** (um redirect em rota de API quebra o cliente JSON — incidente
documentado e guardado por teste desde o Módulo 10). O header nunca chegava lá.

Efeito: `https://loja-b.pdvdepix.app/api/catalog/public` respondia com os produtos
e preços do **arena-tech**. Catálogo do vizinho, no domínio da loja.

**Correção:** a rota resolve o slug do próprio `Host` com a **mesma função** que o
proxy usa (`getCatalogSubdomainSlug`, que já valida caracteres e rejeita
subdomínio reservado). Uma regra, um lugar — em vez de reescrever a validação ou
mexer na isenção deliberada do proxy. Sem subdomínio de catálogo, o comportamento
antigo continua: cai no tenant padrão, que é o caso do host legado.

**Alcance real, medido:** a rota **não tem nenhum consumidor** — varri `src`,
`__tests__` e `docs`. Ninguém a chama. Então não havia ninguém vendo o catálogo
errado hoje; o defeito era uma armadilha armada para o primeiro cliente que a
usasse, e uma URL pública que já respondia errado para quem a digitasse.

> **Dead surface para o dono decidir.** Um endpoint anônimo sem consumidor é
> candidato natural a remoção — o escopo deste programa inclui isso. Não removi:
> é rota **pública**, e não tenho como ver de fora se algum consumidor externo
> (site antigo, parceiro, indexador) depende dela. Corrigir custou uma linha e
> tirou o comportamento errado; remover é decisão do dono, com a informação na
> mão.

## O que auditei e está íntegro

- **Nenhuma procedure pública** nos quatro routers: as 53 são `tenantProcedure`
  ou mais restritas (`simulator.updateConfig` é `superAdminTenantProcedure`).
- **Paginação com teto no caminho anônimo**: `MAX_PAGE_SIZE = 48` no serviço, com
  `clampPageSize` — cheguei a suspeitar que a rota aceitava `pageSize` sem limite
  porque ela só faz `parsePositiveInt`; o teto está no serviço, uma camada
  adiante. Hipótese testada, sem achado.
- **Catálogo não abre para tenant suspenso** — `resolveCatalogTenantId` recusa
  `status === "SUSPENDED"`.
- **Slug de subdomínio validado contra injeção**, com teste próprio
  (`catalog-subdomain-slug.test.ts`, 6 casos incluindo caracteres inválidos e
  subdomínios reservados).

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit   # 2036 verdes (4 novos)
```

**Falha antes do fix, verificada:** removi o `tenantSlug` da chamada e o teste
reprovou com a mensagem que descreve o defeito — *"sem isto a loja-b via o
catálogo do arena-tech: expected undefined to be 'loja-b'"*.
