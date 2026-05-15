# Legacy: Fiscal (NF-e / NFC-e Emissão)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### NF-e Emissão (role:gerente,admin)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /fiscal/nfe | NfeEmissaoController@index | fiscal.nfe.index |
| GET | /fiscal/nfe/nova | @create | fiscal.nfe.create |
| POST | /fiscal/nfe | @store | fiscal.nfe.store |
| POST | /fiscal/nfe/de-venda/{venda} | @criarDeVenda | fiscal.nfe.de-venda |
| GET | /fiscal/nfe/entrada | @entrada | fiscal.nfe.entrada |
| POST | /fiscal/nfe/entrada | @storeEntrada | fiscal.nfe.entrada.store |
| GET | /fiscal/nfe/inutilizar | @inutilizarForm | fiscal.nfe.inutilizar.form |
| POST | /fiscal/nfe/inutilizar | @inutilizar | fiscal.nfe.inutilizar |
| GET | /fiscal/nfe/{nfe} | @show | fiscal.nfe.show |
| GET | /fiscal/nfe/{nfe}/editar | @edit | fiscal.nfe.edit |
| PUT | /fiscal/nfe/{nfe} | @update | fiscal.nfe.update |
| DELETE | /fiscal/nfe/{nfe} | @destroy | fiscal.nfe.destroy |
| POST | /fiscal/nfe/{nfe}/item | @adicionarItem | fiscal.nfe.item.store |
| DELETE | /fiscal/nfe/{nfe}/item/{item} | @removerItem | fiscal.nfe.item.destroy |
| POST | /fiscal/nfe/{nfe}/enviar | @enviar | fiscal.nfe.enviar |
| POST | /fiscal/nfe/{nfe}/cancelar | @cancelar | fiscal.nfe.cancelar |
| POST | /fiscal/nfe/{nfe}/email | @enviarEmail | fiscal.nfe.email |
| GET | /fiscal/nfe/{nfe}/xml | @downloadXml | fiscal.nfe.xml |
| GET | /fiscal/nfe/{nfe}/danfe | @downloadDanfe | fiscal.nfe.danfe |

### Relatório NF (admin)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /relatorios/nf | RelatorioNfController@index | relatorios.nf.index |
| GET | /relatorios/nf/csv | @exportCsv | relatorios.nf.csv |

## 2. Controllers

### NfeEmissaoController
- `index(Request)` — Lista NF-e emitidas com filtros: status, período, modelo (NF-e/NFC-e), busca.
- `create(Request)` — Form: dados do destinatário, itens, impostos.
- `store(Request)` — Cria NF-e via NfeEmissaoService.
- `criarDeVenda(Request, PdvVenda)` — Cria NFC-e a partir de uma venda PDV (auto-preenche itens e valores).
- `entrada()` / `storeEntrada()` — NF-e de entrada (compras).
- `show(NfeEmitida)` — Detalhe: dados, itens, impostos, status, ações.
- `edit/update` — Edição (apenas antes de enviar).
- `adicionarItem/removerItem` — CRUD de itens da NF-e.
- `enviar(NfeEmitida)` — Envia NF-e para SEFAZ via API fiscal.
- `cancelar(Request, NfeEmitida)` — Cancela NF-e autorizada (motivo obrigatório).
- `enviarEmail(Request, NfeEmitida)` — Envia DANFE/XML por email.
- `downloadXml/downloadDanfe` — Downloads.
- `inutilizarForm/inutilizar` — Inutilização de faixa de numeração.
- `destroy(NfeEmitida)` — Exclui NF-e não enviada.

### RelatorioNfController
- `index(Request)` — Relatório fiscal: vendas + OS com flag de NF emitida. Filtros: período, status NF.
- `exportCsv(Request)` — Exporta relatório em CSV.

## 3. Form Requests / Validations

Validação inline.

## 4. Models

### NfeEmitida
**Tabela:** `nfe_emitidas`
- id, numero, serie, modelo (NF-e 55 / NFC-e 65), natureza_operacao, tipo_operacao (entrada/saida), status (rascunho/enviada/autorizada/cancelada/rejeitada/inutilizada), chave_acesso, protocolo_autorizacao, xml_path, danfe_path, referencia_tipo (venda/os), referencia_id, destinatario_*, impostos, data_emissao, data_autorizacao, motivo_cancelamento
- **Relações:** itens (hasMany NfeEmitidaItem)

### NfeEmitidaItem
**Tabela:** `nfe_emitidas_itens`
- id, nfe_emitida_id, produto_id, cfop, ncm, descricao, quantidade, unidade, valor_unitario, valor_total, impostos (ICMS, PIS, COFINS, IPI)

## 5. Services

### NfeEmissaoService
- `criarDeVenda(PdvVenda, modelo)` — Cria NF-e a partir de venda PDV. Mapeia itens.
- `criarEntrada(dados)` — Cria NF-e de entrada.
- `adicionarItem/calcularImpostosItem` — Gerencia itens e calcula impostos.
- `validar(NfeEmitida)` — Valida NF-e antes de enviar.
- `enviar(NfeEmitida)` — Envia via FiscalApiInterface.
- `consultarStatus/cancelar/inutilizar` — Operações SEFAZ.
- `gerarDanfe(NfeEmitida)` — Gera DANFE (PDF).
- `enviarPorEmail(NfeEmitida, email)` — Envia por email.

### FiscalApiInterface (Strategy Pattern)
**Arquivo:** app/Services/Fiscal/FiscalApiInterface.php
- Interface com métodos: enviar, consultar, cancelar, inutilizar, gerarDanfe.

### NuvemFiscalService
**Arquivo:** app/Services/Fiscal/NuvemFiscalService.php
- Implementação da interface para Nuvem Fiscal API.

### FocusNfeService
**Arquivo:** app/Services/Fiscal/FocusNfeService.php
- Implementação alternativa para Focus NFe API.

### NFEService (consulta)
- `validarNFe(chave)` — Valida NF-e por chave de acesso.

## 6. Jobs

Nenhum.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

### Nuvem Fiscal
- **Endpoint:** api.nuvemfiscal.com.br
- **Auth:** OAuth2 Client Credentials
- **Uso:** Emissão, consulta, cancelamento, inutilização de NF-e/NFC-e, geração de DANFE

### Focus NFe (alternativo)
- **Endpoint:** homologacao.focusnfe.com.br / api.focusnfe.com.br
- **Auth:** Token
- **Uso:** Mesma interface que Nuvem Fiscal

### MeuDANFE (consulta)
- Validação de NF-e por chave de acesso.

## 9. Migrations

- nfe_emitidas, nfe_emitidas_itens (emissão)
- nfe_importacoes, nfe_itens (importação — módulo estoque)

## 10. Views

- resources/views/fiscal/ — Listagem, criação, detalhe, edição de NF-e

## 11. Policies

Restrito a role:gerente,admin via middleware.

## 12. Comandos Artisan customizados

### EmitirNfceHprimeCommand
- Emite NFC-e para H'Prime (caso específico).

## 13. Scheduled tasks

Nenhum.

## 14. Dependências cruzadas

- **Usa PdvVenda** — Criar NF-e de venda
- **Usa OrdemServico** — Referência em NF-e de OS
- **Usa Produto** — Itens da NF-e
- **Usa Configuração** — Dados fiscais do emitente (CNPJ, IE, regime tributário, certificado)

## 15. Configurações / .env vars

- `NUVEM_FISCAL_CLIENT_ID` / `NUVEM_FISCAL_CLIENT_SECRET` — OAuth2 Nuvem Fiscal
- `FOCUS_NFE_TOKEN` — Token Focus NFe
- Configurações fiscais do tenant: CNPJ, IE, IM, CNAE, regime tributário, série NF-e, série NFC-e, certificado digital

## 16. Observações técnicas relevantes

1. **Strategy Pattern** — FiscalApiInterface com duas implementações (Nuvem Fiscal e Focus NFe). Configurável por tenant.
2. **NF-e de entrada via módulo estoque** — NfeImportController (estoque) faz import de NF-e de compra (XML). NfeEmissaoController faz emissão de NF-e de saída. São fluxos diferentes.
3. **Decisão pendente** — Provider padrão no Next.js (já registrado: Nuvem Fiscal).
4. **DANFE gerado via API** — A API fiscal retorna o DANFE. Não é gerado localmente.
