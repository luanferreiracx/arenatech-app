# ADR 0018 — NCM via BrasilAPI com Cache Redis

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Estoque-A (Catálogo de Produtos)

## Problema

Produtos precisam de código NCM (Nomenclatura Comum do Mercosul) para emissão de NF-e. O legacy tem busca NCM com mapa curado + API externa.

## Decisão

**BrasilAPI como provider de busca NCM + cache Redis.**

### Endpoints

- Busca textual: `GET https://brasilapi.com.br/api/ncm/v1?search={termo}`
- Detalhe: `GET https://brasilapi.com.br/api/ncm/v1/{codigo}`

### Cache Redis

- Busca por termo: chave `ncm:search:{termo_normalizado}`, TTL 24h
- Código individual: chave `ncm:code:{codigo}`, TTL 30 dias

### Fluxo

1. Usuário digita termo (min 3 chars)
2. Sistema consulta **mapa curado local** (45+ categorias de assistência técnica)
3. Se resultados insuficientes, chama BrasilAPI (com cache)
4. Exibe resultados combinados (local primeiro, API depois)
5. Timeout: 5s

### Degradação graciosa

Se BrasilAPI fora do ar:
- Modal mostra aviso "Serviço indisponível"
- Campo NCM permanece editável manualmente (input text livre)
- Sem blocking: formulário continua funcional

## Justificativa

- BrasilAPI é pública, gratuita, sem autenticação
- Cache 24h para buscas (termos mudam pouco no contexto do tenant)
- Cache 30d para códigos (NCM é publicação da Receita Federal, muda raramente)
- Mapa curado local cobre 80%+ dos casos de uso de assistência técnica (celulares, acessórios, peças)
- Timeout de 5s evita UX degradada

## Alternativas descartadas

- Banco local completo de NCM (~13.000 códigos): overhead de manutenção, atualização periódica
- Receita Federal diretamente: sem API pública estável
- Focus NFe NCM API: dependência paga desnecessária para busca simples
