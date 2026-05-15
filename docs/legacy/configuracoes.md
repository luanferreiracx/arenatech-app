# Legacy: Configurações

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /configuracoes | ConfiguracaoController@index | configuracoes.index |
| PUT | /configuracoes | @update | configuracoes.update |
| PUT | /configuracoes/assistencia | @updateAssistencia | configuracoes.assistencia |
| PUT | /configuracoes/geral | @updateGeral | configuracoes.geral |
| GET | /configuracoes/fiscal | @fiscal | configuracoes.fiscal |
| PUT | /configuracoes/fiscal | @updateFiscal | configuracoes.fiscal.update |
| GET | /configuracoes/pagamento | @pagamento | configuracoes.pagamento |
| PUT | /configuracoes/pagamento | @updatePagamento | configuracoes.pagamento.update |
| GET | /admin/parcelamento | ParcelamentoController@index | admin.parcelamento.index |
| PUT | /admin/parcelamento | @update | admin.parcelamento.update |

## 2. Controllers

### ConfiguracaoController
- `index()` — Tela principal: config geral, assistência, fiscal, pagamento em tabs.
- `update(Request)` — Atualiza configurações gerais.
- `updateAssistencia(Request)` — Config de assistência: termos, garantia padrão, mensagens.
- `updateGeral(Request)` — Config geral: nome, CNPJ, telefone, endereço com CEP.
- `fiscal()` — Tela de config fiscal: razão social, IE, IM, CNAE, regime tributário, NF-e/NFC-e (série, próximo número), certificado digital.
- `updateFiscal(Request)` — Salva config fiscal. Upload de certificado digital (.pfx).
- `pagamento()` — Config de pagamento: formas ativas, taxas.
- `updatePagamento(Request)` — Salva config de pagamento.

### ParcelamentoController
- `index()` — Tabela de juros por parcela (2x-36x).
- `update(Request)` — Atualiza taxas de juros.

## 3. Form Requests / Validations

Validação inline.

## 4. Models

### Configuracao
**Tabela:** `configuracoes`
- Modelo key-value: chave, valor, tipo.
- Método estático `obter(chave)` — Retorna valor da configuração.
- Método estático `salvar(chave, valor)` — Salva configuração.

### ConfiguracaoAssistencia
**Tabela:** `configuracoes_assistencia`
- Singleton por tenant: termos_servico, termos_garantia, termos_entrega, prazo_garantia_padrao, mensagem_conclusao, mensagem_rastreamento.

### ConfiguracaoParcelamento
**Tabela:** `configuracoes_parcelamento`
- **36 colunas:** juros_2x, juros_3x, ..., juros_36x (cada uma é decimal com taxa % por parcela).
- Singleton por tenant.

### ConfiguracaoRecebimento
**Tabela:** `configuracoes_recebimento`
- Configurações de recebimento: alertas de vencimento, etc.

## 5. Services

Nenhum service dedicado.

## 6. Jobs

Nenhum.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

### ViaCEP
- Preenchimento automático de endereço por CEP.

## 9. Migrations

- configuracoes, configuracoes_assistencia, configuracoes_parcelamento, configuracoes_recebimento

## 10. Views

- resources/views/configuracoes/ — Tabs: geral, assistência, fiscal, pagamento

## 11. Policies

Configurações geralmente acessíveis a admin/gerente.

## 12. Comandos Artisan customizados

Nenhum.

## 13. Scheduled tasks

Nenhum.

## 14. Dependências cruzadas

- **Usado por Simulador** — ConfiguracaoParcelamento para calcular tabela de parcelas
- **Usado por PDV** — Configuracao "formas_pagamento_ativas" para filtrar formas
- **Usado por OS** — ConfiguracaoAssistencia para termos e prazo garantia padrão
- **Usado por Fiscal** — Config fiscal para dados do emitente

## 15. Configurações / .env vars

As configurações são stored in DB, não em .env (exceto credenciais de API que ficam em .env).

## 16. Observações técnicas relevantes

1. **ConfiguracaoParcelamento com 36 colunas** — Já identificado como redesign necessário. Next.js usa tabela relacional.
2. **Modelo key-value** — Configuracao usa chave/valor genérico. ConfiguracaoAssistencia e Parcelamento são modelos específicos.
3. **Certificado digital** — Upload de .pfx para NF-e. Armazenado no storage.
4. **Config fiscal complexa** — Regime tributário, CST/CSOSN, alíquotas ICMS, PIS, COFINS para cada cenário.
