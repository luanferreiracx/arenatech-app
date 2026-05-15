# ADR 0007: Endereço do cliente em campos separados (não JSON)

## Status
Aceita

## Contexto
O dono pediu decisão sobre formato de endereço: campos separados (como legacy) ou JSON em coluna única.

Opções avaliadas:

### A) Campos separados (zipCode, street, streetNumber, complement, neighborhood, city, state)
- **Prós:** Queries SQL diretas (`WHERE city = 'Teresina'`), compatível com integrações fiscais que exigem campos estruturados (NF-e precisa de endereço do destinatário em campos separados), facilita relatórios/filtros
- **Contras:** 7 colunas na tabela, migration mais verbosa

### B) JSON em coluna `address`
- **Prós:** Schema mais limpo, flexível para adicionar campos
- **Contras:** Queries em JSON são mais lentas e verbosas em PostgreSQL, integrações fiscais (NF-e) precisariam extrair campos do JSON, não indexável nativamente para filtros por cidade/estado

## Decisão
**Campos separados** (opção A).

Razões decisivas:
1. NF-e exige endereço estruturado (logradouro, número, bairro, município, UF separados). JSON exigiria parsing extra.
2. Relatórios por cidade/estado são cenário provável (análise de mercado por região).
3. O legacy já usa campos separados — menor atrito na migração.
4. 7 colunas é custo aceitável para uma tabela que terá no máximo dezenas de milhares de registros.

## Consequências
- Mantém compatibilidade direta com legacy (mesmos campos, novos nomes em inglês)
- NF-e pode ler endereço diretamente sem parsing
- Migração de dados: mapeamento 1:1 de campos
