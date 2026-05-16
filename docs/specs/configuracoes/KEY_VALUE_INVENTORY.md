# Inventário do Key-Value `configuracoes`

> Levantamento exaustivo de TODAS as chaves usadas via `Configuracao::obter()` e `Configuracao::definir()` no código Laravel.

## Resumo

- **Total de chaves únicas:** 38
- **Famílias propostas:** 4
- **Chaves descartáveis (código morto):** 2

---

## Tabela completa de chaves

### Família 1: LOJA (dados gerais da assistência — exibição UI, PDFs, layout)

| Chave | Onde é usada | Tipo | Default | Propósito |
|-------|--------------|------|---------|-----------|
| `nome_loja` | AppServiceProvider:27, ConfiguracaoController:61/89, views (5+ Blade templates) | string | 'Arena Tech' | Nome fantasia para exibição global (navbar, PDFs, documentos) |
| `cnpj_loja` | ConfiguracaoController:62/95, views PDV documentos (4 templates), NfeImportController:580 | string | '' | CNPJ da loja para PDFs e documentos |
| `telefone_loja` | ConfiguracaoController:63/100, views PDV documentos (4 templates) | string | '' | Telefone para PDFs |
| `logo_loja` | AppServiceProvider:28, ConfiguracaoController:64/129/141/152/156, views PDV documentos (4 templates), layout app | string | '' | Caminho do logo no storage |
| `endereco_loja` | views PDV documentos (4 templates: termo-responsabilidade, recibo, etc.) | string | '' | Endereço textual para PDFs |
| `garantia_aparelho_novo` | PdvCarrinhoService:286, view pdv/nova:956 | int | 12 | Garantia em meses para aparelhos novos (PDV) |
| `garantia_aparelho_seminovo` | PdvCarrinhoService:287-288, view pdv/nova:957 | int | 3 | Garantia em meses para aparelhos seminovos (PDV) |

**Total: 7 chaves**

### Família 2: FISCAL (dados do emitente para NF-e/NFC-e)

| Chave | Onde é usada | Tipo | Default | Propósito |
|-------|--------------|------|---------|-----------|
| `fiscal_cnpj` | NfeEmissaoService:539, NuvemFiscalService:283/387/526, NfeImportController:579, ConfiguracaoController:394 | string | '' | CNPJ do emitente na NF-e |
| `fiscal_razao_social` | NfeEmissaoService:540, NuvemFiscalService:495 | string | '' | Razão social na NF-e |
| `fiscal_inscricao_estadual` | NfeEmissaoService:541, NuvemFiscalService:501 | string | '' | IE do emitente |
| `fiscal_nome_fantasia` | NfeEmissaoService:542 | string | '' | Nome fantasia na NF-e |
| `fiscal_cnae` | NfeEmissaoService:543 | string | '' | CNAE do emitente |
| `fiscal_regime_tributario` | NfeEmissaoService:544/567, NuvemFiscalService:30 | int | 1 | Regime tributário (1=Simples Nacional) |
| `fiscal_cep` | NfeEmissaoService:545, NuvemFiscalService:509/747 | string | '' | CEP do emitente |
| `fiscal_logradouro` | NfeEmissaoService:546, NuvemFiscalService:503/738 | string | '' | Logradouro |
| `fiscal_numero` | NfeEmissaoService:547, NuvemFiscalService:504/742 | string | '' | Número |
| `fiscal_complemento` | NfeEmissaoService:548 | string | '' | Complemento |
| `fiscal_bairro` | NfeEmissaoService:549, NuvemFiscalService:505/743 | string | '' | Bairro |
| `fiscal_cidade` | NfeEmissaoService:550, NuvemFiscalService:507/745 | string | '' | Cidade |
| `fiscal_uf` | NfeEmissaoService:551, NuvemFiscalService:384/508/746, FocusNfeService:253 | string | '' | UF |
| `fiscal_codigo_municipio` | NfeEmissaoService:552, NuvemFiscalService:506/744 | string | '' | Código IBGE do município |
| `fiscal_nfe_ambiente` | NfeEmissaoService:692, NuvemFiscalService:30, FocusNfeService:26 | int | 2 | Ambiente NF-e (1=produção, 2=homologação) |
| `fiscal_nfe_serie` | NfeEmissaoService:562, EmitirNfceHprimeCommand:186 | string | '1' | Série da NF-e |
| `fiscal_nfce_serie` | NfeEmissaoService:560, EmitirNfceHprimeCommand:184 | string | '1' | Série da NFC-e |
| `fiscal_csosn_padrao` | NfeEmissaoService:572 | string | '102' | CSOSN padrão Simples Nacional |
| `fiscal_certificado_path` | ConfiguracaoController:386 | string | '' | Caminho do certificado .pfx no storage |
| `fiscal_certificado_senha` | ConfiguracaoController:390/409 | string | '' | Senha do certificado digital (⚠️ plaintext!) |
| `fiscal_habilitado` | ConfiguracaoController:379 | boolean | 'false' | Se NF-e está habilitada pro tenant |
| `fiscal_emitir_nf_automatico` | ConfiguracaoController:378 | boolean | 'false' | Emitir NF-e automaticamente ao concluir venda/OS |
| `fiscal_api_token` | FocusNfeService:27 | string | '' | Token da API Focus NFe |

**Total: 23 chaves**

### Família 3: PAGAMENTO (formas ativas)

| Chave | Onde é usada | Tipo | Default | Propósito |
|-------|--------------|------|---------|-----------|
| `formas_pagamento_ativas` | ConfiguracaoController:430/456, PdvVenda:108 | json (array de strings) | todas as formas | Lista de formas de pagamento habilitadas |

**Total: 1 chave** (conceito substituído pelo modelo PaymentMethod tipado)

### Família 4: RECOMPENSAS (configuração do programa de cashback)

| Chave | Onde é usada | Tipo | Default | Propósito |
|-------|--------------|------|---------|-----------|
| `recompensas.max_cashback_por_cliente` | RecompensaConfiguracaoController:31, RecompensaController:245 | decimal | 100.00 | Teto de cashback por cliente (R$) |
| `recompensas.periodo_limite_cashback` | RecompensaConfiguracaoController:32, RecompensaController:246 | string | 'mes' | Período do limite (mes/semana/dia) |
| `recompensas.max_desconto_por_cliente` | RecompensaConfiguracaoController:33, RecompensaController:247 | decimal | 100.00 | Teto de desconto por cliente (R$) |
| `recompensas.periodo_limite_desconto` | RecompensaConfiguracaoController:34, RecompensaController:248 | string | 'mes' | Período do limite |
| `recompensas.max_cashback_percentual` | RecompensaConfiguracaoController:35/119, RecompensaController:71/121/249 | int | 100 | % máximo de cashback sobre valor da ação |
| `recompensas.max_desconto_percentual` | RecompensaConfiguracaoController:36/120, RecompensaController:72/122/250 | int | 20 | % máximo de desconto aplicável |
| `recompensas.max_recompensas_ativas_por_cliente` | RecompensaConfiguracaoController:37, RecompensaController:253 | int | 3 | Número máximo de recompensas ativas simultâneas |
| `recompensas.dias_expiracao_padrao_cashback` | RecompensaConfiguracaoController:38, RecompensaController:73/251, RecompensaCadastroController:38 | int | 30 | Dias de expiração padrão de cashback |
| `recompensas.dias_expiracao_padrao_desconto` | RecompensaConfiguracaoController:39, RecompensaController:74/252, RecompensaCadastroController:39 | int | 15 | Dias de expiração padrão de desconto |
| `recompensas_limite_mensal_cliente` | RecompensaCadastroController:41 | int | 0 | Limite mensal total por cliente |
| `recompensas_max_ativas_simultaneas` | RecompensaCadastroController:42 | int | 0 | Máximo de ativas |
| `recompensas_teto_desconto_fixo` | RecompensaCadastroController:43 | decimal | 0 | Teto de desconto fixo em R$ |
| `recompensas_teto_percentual` | RecompensaCadastroController:44 | int | 0 | Teto percentual |

**Total: 13 chaves**
> Nota: naming inconsistente no legacy (some `recompensas.X` com ponto, some `recompensas_X` com underline).

---

## Chaves candidatas a código morto / descarte

| Chave | Razão |
|-------|-------|
| `fiscal_api_token` | Token do Focus NFe — sistema novo usa apenas Nuvem Fiscal (decisão ADR). Não replicar. |
| `fiscal_certificado_senha` | Armazenada em plaintext no banco. No novo sistema, senha NÃO será armazenada (pedir ao usar). |

---

## Proposta de modelos tipados

### Modelo 1: `TenantGeneral` (Família LOJA)
Substitui chaves `nome_loja`, `cnpj_loja`, `telefone_loja`, `logo_loja`, `endereco_loja`, `garantia_aparelho_novo`, `garantia_aparelho_seminovo`.

| Campo Prisma | Tipo | Origem key-value |
|-------------|------|------------------|
| tenantId | String @db.Uuid | FK (PK) |
| tradeName | String | nome_loja |
| cnpj | String? | cnpj_loja |
| phone | String? | telefone_loja |
| email | String? | (não está no key-value, mas ConfiguracaoAssistencia tem) |
| logoUrl | String? | logo_loja (migra de path local para URL MinIO) |
| zipCode | String? | endereço (parte CEP, campos separados ADR 0007) |
| street | String? | endereço |
| streetNumber | String? | endereço |
| complement | String? | endereço |
| neighborhood | String? | endereço |
| city | String? | endereço |
| state | String? | endereço |
| warrantyNewMonths | Int | garantia_aparelho_novo (default 12) |
| warrantyUsedMonths | Int | garantia_aparelho_seminovo (default 3) |

### Modelo 2: `TenantFiscalSettings` (Família FISCAL)
Substitui as 23 chaves `fiscal_*`.

| Campo Prisma | Tipo | Origem key-value |
|-------------|------|------------------|
| tenantId | String @db.Uuid | FK (PK) |
| legalName | String? | fiscal_razao_social |
| tradeName | String? | fiscal_nome_fantasia |
| cnpj | String? | fiscal_cnpj |
| ie | String? | fiscal_inscricao_estadual |
| cnae | String? | fiscal_cnae |
| taxRegime | Int | fiscal_regime_tributario (1=SN, 2=LP, 3=LR) |
| zipCode | String? | fiscal_cep |
| street | String? | fiscal_logradouro |
| streetNumber | String? | fiscal_numero |
| complement | String? | fiscal_complemento |
| neighborhood | String? | fiscal_bairro |
| city | String? | fiscal_cidade |
| state | String? | fiscal_uf |
| municipalityCode | String? | fiscal_codigo_municipio |
| nfeEnvironment | Int | fiscal_nfe_ambiente (1=prod, 2=homolog) |
| nfeSeries | String | fiscal_nfe_serie (default '1') |
| nfceSeries | String | fiscal_nfce_serie (default '1') |
| defaultCsosn | String? | fiscal_csosn_padrao |
| enabled | Boolean | fiscal_habilitado |
| autoIssue | Boolean | fiscal_emitir_nf_automatico |
| certificateUrl | String? | fiscal_certificado_path (migra para URL MinIO encriptado) |
| certificateUploadedAt | DateTime? | — |
| certificateExpiresAt | DateTime? | — |

### Modelo 3: `TenantReceivingSettings` (ConfiguracaoRecebimento, existente)
Já é modelo dedicado. Apenas traduzir campos.

| Campo Prisma | Tipo | Origem |
|-------------|------|--------|
| tenantId | String @db.Uuid | FK (PK) |
| defaultPolicyDevice | String | politica_default_aparelho |
| defaultPolicyNonDevice | String | politica_default_nao_aparelho |
| minInstallmentAmount | Int (centavos) | valor_minimo_parcelamento |
| requireCpfAbove | Int (centavos) | exige_cpf_acima_de |
| autoCloseTime | String? | hora_fechamento_automatico (HH:MM) |
| monthlySalesGoal | Int? (centavos) | meta_mensal_vendas |
| defaultDasRate | Decimal? | aliquota_das_padrao |
| defaultIcmsDiffRate | Decimal? | aliquota_icms_diferencial_padrao |

### Modelo 4: `TenantRewardSettings` (Família RECOMPENSAS)
Substitui as 13 chaves `recompensas*`.

> NOTA: Este modelo pertence ao módulo Recompensas (Fase 14). Será especificado na SPEC de Recompensas. Incluído aqui apenas para completude do inventário — NÃO incluir na SPEC de Configurações.

### Modelo 5: `TenantAssistanceSettings` (ConfiguracaoAssistencia, existente)
Já é modelo dedicado. Traduzir campos.

| Campo Prisma | Tipo | Origem |
|-------------|------|--------|
| tenantId | String @db.Uuid | FK (PK) |
| termsOfService | String? @db.Text | termos_servico |
| warrantyPolicy | String? @db.Text | politica_garantia |
| businessHours | String? | horario_funcionamento |

> NOTA: Campos `nome_assistencia`, `cnpj`, `telefone`, `email`, `endereco`, `cidade`, `estado`, `cep`, `logo_path` de ConfiguracaoAssistencia serão MESCLADOS com TenantGeneral (são duplicatas). No novo, existe apenas TenantGeneral para dados da loja.

### Modelo 6: `PaymentMethod` + `PaymentMethodRate` (Família PAGAMENTO)
Substitui `formas_pagamento_ativas` (key-value JSON) + `FormaPagamento` + `FormaPagamentoTaxa`.

- `PaymentMethod`: código, rótulo, ícone, cor, ativo, ordem, aceita_parcelas, parcelas_min, parcelas_max, prazo_recebimento_dias, observações
- `PaymentMethodRate`: forma_pagamento_id, parcelas, taxa_percentual, taxa_fixa, prazo_recebimento_dias, aplica_em, politica_taxa, ativo

### Modelo 7: `InstallmentRate` (substitui ConfiguracaoParcelamento)
Substitui 36 colunas juros_Xx por tabela relacional.

---

## Decisão proposta de agrupamento

| Modelo proposto | Escopo no módulo Configurações? | Razão |
|----------------|--------------------------------|-------|
| TenantGeneral | ✅ SIM | Dados gerais da loja |
| TenantFiscalSettings | ✅ SIM | Config fiscal (CRUD, M3) |
| TenantAssistanceSettings | ✅ SIM | Termos, garantia, horário |
| TenantReceivingSettings | ✅ SIM | Alertas, políticas de recebimento |
| PaymentMethod + PaymentMethodRate | ✅ SIM | Formas de pagamento + taxas |
| InstallmentRate | ✅ SIM | Tabela de parcelamento |
| TenantRewardSettings | ❌ NÃO — módulo Recompensas | Será especificado lá |

**Total: 6 modelos + 1 adiado = 7 modelos tipados substituem 38 chaves + 4 tabelas existentes.**
