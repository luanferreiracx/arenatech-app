# ADR 0014: Formas de pagamento híbridas (fixas + customizadas)

## Status
Aceita

## Contexto
Legacy usa constante PHP hardcoded (`PdvVenda::FORMAS_PAGAMENTO`) + JSON em key-value (`formas_pagamento_ativas`) para ativar/desativar. Sem taxas, sem configuração granular. Separadamente, `FormaPagamento` + `FormaPagamentoTaxa` gerenciam taxas por parcela/tipo.

## Decisão
Modelo híbrido:
- **4 formas FIXAS** (type=FIXED): Dinheiro, PIX, Cartão Crédito, Cartão Débito
  - Criadas automaticamente no seed de novo tenant
  - Code imutável (DINHEIRO, PIX, CARTAO_CREDITO, CARTAO_DEBITO)
  - Não podem ser deletadas, apenas desativadas
- **Formas CUSTOMIZADAS** (type=CUSTOM): tenant adiciona livremente
  - Code gerado via slugify do nome
  - Podem ser deletadas

### Mapeamento para NF-e SEFAZ (campo `nfeCode`)

| Forma | Código SEFAZ (tPag) | Descrição SEFAZ |
|-------|---------------------|-----------------|
| DINHEIRO | 01 | Dinheiro |
| PIX | 17 | Pagamento Instantâneo (PIX) |
| CARTAO_CREDITO | 03 | Cartão de Crédito |
| CARTAO_DEBITO | 04 | Cartão de Débito |
| (custom) | 99 | Outros (ou código específico se tenant configurar) |

## Consequências
- Tenant sempre começa com 4 formas prontas (zero config para começar a vender)
- Formas de pagamento agora ficam no banco (não em constante PHP) — editável em runtime
- Módulo Fiscal lê `nfeCode` para preencher campo `tPag` da NF-e
- Legacy `formas_pagamento_ativas` (JSON) é eliminado — substituído por campo `active` boolean
