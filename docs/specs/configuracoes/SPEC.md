# SPEC: Configurações

> **Status:** rascunho aguardando revisão do dono
> **Base:** docs/legacy/configuracoes.md + KEY_VALUE_INVENTORY aprovado + decisões do dono (PROMPT)
> **Versão:** 1.0

---

## 1. Visão geral

Módulo fundação que centraliza todas as configurações operacionais de um tenant: dados gerais da loja, configuração fiscal para emissão de NF-e, formas de pagamento com taxas, tabela de parcelamento, termos de assistência técnica e políticas de recebimento. É consumido por praticamente todos os outros módulos (OS, PDV, Fiscal, Caixa, Financeiro, Comunicação).

---

## 2. Glossário

| Termo | Definição |
|-------|-----------|
| **TenantGeneral** | Dados gerais da loja: nome, CNPJ, telefone, endereço, logo, garantias padrão. |
| **TenantFiscalSettings** | Configuração do emitente para NF-e/NFC-e: razão social, IE, regime tributário, séries, certificado digital. |
| **TenantAssistanceSettings** | Termos e políticas de assistência técnica: termos de serviço, garantia, horário de funcionamento. |
| **TenantReceivingSettings** | Políticas de recebimento e operação: valor mínimo parcelamento, exigência CPF, meta vendas, alíquotas DAS/ICMS. |
| **PaymentMethod** | Forma de pagamento configurada por tenant (dinheiro, PIX, cartão, etc.) com propriedades de parcelamento. |
| **PaymentMethodRate** | Taxa aplicável por forma de pagamento, parcelas, tipo de produto e política (quem paga a taxa). |
| **InstallmentRate** | Taxa de juros por quantidade de parcelas (tabela relacional substituindo 36 colunas do legacy). |
| **Regime Tributário** | Enquadramento fiscal (1=Simples Nacional, 2=Lucro Presumido, 3=Lucro Real). |
| **CSOSN** | Código de Situação da Operação no Simples Nacional (ex: 102 = sem permissão de crédito). |
| **Certificado Digital** | Arquivo .pfx (A1) usado para assinar NF-e eletronicamente. |

---

## 3. Modelos de dados

### 3.1 TenantGeneral

Singleton por tenant. Substitui chaves `nome_loja`, `cnpj_loja`, `telefone_loja`, `logo_loja`, `endereco_loja`, `garantia_aparelho_novo`, `garantia_aparelho_seminovo` + campos de ConfiguracaoAssistencia que eram duplicados (nome, cnpj, telefone, endereço, logo).

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem |
|-------|-------------|----------|---------|---------------|--------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão |
| tenantId | String @db.Uuid | NO | — | — | RLS, @@unique |
| tradeName | String | NO | '' | z.string().max(255) | key-value `nome_loja` + ConfigAssistencia `nome_assistencia` |
| legalName | String? | YES | — | z.string().max(255) | implícito (PJ sempre tem razão social) |
| cnpj | String? | YES | — | validateCNPJ | key-value `cnpj_loja` + ConfigAssistencia `cnpj` |
| phone | String? | YES | — | z.string().max(20) | key-value `telefone_loja` + ConfigAssistencia `telefone` |
| email | String? | YES | — | z.string().email().max(255) | ConfigAssistencia `email` |
| logoUrl | String? | YES | — | z.string().url() | key-value `logo_loja` (migra de path para URL MinIO) |
| zipCode | String? | YES | — | z.string().max(9) | key-value `endereco_loja` desestruturado |
| street | String? | YES | — | z.string().max(255) | ADR 0007 campos separados |
| streetNumber | String? | YES | — | z.string().max(20) | ADR 0007 |
| complement | String? | YES | — | z.string().max(100) | ADR 0007 |
| neighborhood | String? | YES | — | z.string().max(100) | ADR 0007 |
| city | String? | YES | — | z.string().max(100) | ADR 0007 |
| state | String? | YES | — | z.string().length(2) | ADR 0007 |
| warrantyNewMonths | Int | NO | 12 | z.number().int().min(0).max(120) | key-value `garantia_aparelho_novo` |
| warrantyUsedMonths | Int | NO | 3 | z.number().int().min(0).max(120) | key-value `garantia_aparelho_seminovo` |
| businessHours | String? | YES | — | z.string().max(500) | ConfigAssistencia `horario_funcionamento` |
| createdAt | DateTime @default(now()) | NO | now() | — | padrão |
| updatedAt | DateTime @updatedAt | NO | — | — | padrão |

**Índices:** `@@unique([tenantId])`
**Relação:** belongsTo Tenant
**RLS:** Sim
**Singleton:** 1 registro por tenant (upsert pattern)

### 3.2 TenantAssistanceSettings

Singleton por tenant. Termos e políticas textuais de assistência técnica.

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem |
|-------|-------------|----------|---------|---------------|--------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão |
| tenantId | String @db.Uuid | NO | — | — | RLS, @@unique |
| termsOfService | String? @db.Text | YES | — | z.string() | legacy `termos_servico` |
| warrantyPolicy | String? @db.Text | YES | — | z.string() | legacy `politica_garantia` |
| createdAt | DateTime @default(now()) | NO | now() | — | padrão |
| updatedAt | DateTime @updatedAt | NO | — | — | padrão |

**Índices:** `@@unique([tenantId])`
**RLS:** Sim
**Singleton:** 1 registro por tenant

### 3.3 TenantFiscalSettings

Singleton por tenant. Configuração do emitente para NF-e/NFC-e. // origem: M3 — CRUD apenas, uso real fica no módulo Fiscal.

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem |
|-------|-------------|----------|---------|---------------|--------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão |
| tenantId | String @db.Uuid | NO | — | — | RLS, @@unique |
| legalName | String? | YES | — | z.string().max(255) | key-value `fiscal_razao_social` |
| tradeName | String? | YES | — | z.string().max(255) | key-value `fiscal_nome_fantasia` |
| cnpj | String? | YES | — | validateCNPJ | key-value `fiscal_cnpj` |
| ie | String? | YES | — | z.string().max(20) | key-value `fiscal_inscricao_estadual` |
| cnae | String? | YES | — | z.string().max(10) | key-value `fiscal_cnae` |
| taxRegime | Int | NO | 1 | z.number().int().min(1).max(3) | key-value `fiscal_regime_tributario` |
| zipCode | String? | YES | — | z.string().max(9) | key-value `fiscal_cep` |
| street | String? | YES | — | z.string().max(255) | key-value `fiscal_logradouro` |
| streetNumber | String? | YES | — | z.string().max(20) | key-value `fiscal_numero` |
| complement | String? | YES | — | z.string().max(100) | key-value `fiscal_complemento` |
| neighborhood | String? | YES | — | z.string().max(100) | key-value `fiscal_bairro` |
| city | String? | YES | — | z.string().max(100) | key-value `fiscal_cidade` |
| state | String? | YES | — | z.string().length(2) | key-value `fiscal_uf` |
| municipalityCode | String? | YES | — | z.string().max(7) | key-value `fiscal_codigo_municipio` |
| nfeEnvironment | Int | NO | 2 | z.number().int().min(1).max(2) | key-value `fiscal_nfe_ambiente` (1=prod, 2=homolog) |
| nfeSeries | String | NO | '1' | z.string().max(3) | key-value `fiscal_nfe_serie` |
| nfceSeries | String | NO | '1' | z.string().max(3) | key-value `fiscal_nfce_serie` |
| defaultCsosn | String? | YES | '102' | z.string().max(4) | key-value `fiscal_csosn_padrao` |
| enabled | Boolean | NO | false | z.boolean() | key-value `fiscal_habilitado` |
| autoIssue | Boolean | NO | false | z.boolean() | key-value `fiscal_emitir_nf_automatico` |
| certificateUrl | String? | YES | — | z.string() | key-value `fiscal_certificado_path` (migra para MinIO encriptado, M4) |
| certificateUploadedAt | DateTime? | YES | — | — | novo (data do último upload) |
| certificateExpiresAt | DateTime? | YES | — | — | novo (extração ao upload) |
| createdAt | DateTime @default(now()) | NO | now() | — | padrão |
| updatedAt | DateTime @updatedAt | NO | — | — | padrão |

**Índices:** `@@unique([tenantId])`
**RLS:** Sim
**Anti-escopo:** `fiscal_api_token` (Focus NFe removido) e `fiscal_certificado_senha` (não armazena senha, M4)

### 3.4 TenantReceivingSettings

Singleton por tenant. Políticas de recebimento, metas e alíquotas tributárias.

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem |
|-------|-------------|----------|---------|---------------|--------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão |
| tenantId | String @db.Uuid | NO | — | — | RLS, @@unique |
| defaultPolicyDevice | String | NO | 'CUSTOMER_PAYS' | z.enum(['STORE_ABSORBS', 'CUSTOMER_PAYS']) | legacy `politica_default_aparelho` |
| defaultPolicyNonDevice | String | NO | 'STORE_ABSORBS' | z.enum(['STORE_ABSORBS', 'CUSTOMER_PAYS']) | legacy `politica_default_nao_aparelho` |
| minInstallmentAmount | Int | NO | 5000 | z.number().int().min(0) | legacy `valor_minimo_parcelamento` (centavos) |
| requireCpfAbove | Int | NO | 50000 | z.number().int().min(0) | legacy `exige_cpf_acima_de` (centavos) |
| autoCloseTime | String? | YES | — | z.string().regex(/^\d{2}:\d{2}$/) | legacy `hora_fechamento_automatico` (HH:MM) |
| monthlySalesGoal | Int? | YES | — | z.number().int().min(0) | legacy `meta_mensal_vendas` (centavos) |
| defaultDasRate | Decimal? @db.Decimal(5,2) | YES | — | z.number().min(0).max(100) | legacy `aliquota_das_padrao` (%) |
| defaultIcmsDiffRate | Decimal? @db.Decimal(5,2) | YES | — | z.number().min(0).max(100) | legacy `aliquota_icms_diferencial_padrao` (%) |
| createdAt | DateTime @default(now()) | NO | now() | — | padrão |
| updatedAt | DateTime @updatedAt | NO | — | — | padrão |

**Índices:** `@@unique([tenantId])`
**RLS:** Sim

### 3.5 PaymentMethod

Formas de pagamento por tenant. Substitui `FormaPagamento` do legacy + o JSON `formas_pagamento_ativas` do key-value.

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem |
|-------|-------------|----------|---------|---------------|--------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão |
| tenantId | String @db.Uuid | NO | — | — | RLS |
| code | String | NO | — | z.string().max(50) | legacy `codigo` |
| name | String | NO | — | z.string().max(100) | legacy `rotulo` |
| type | PaymentMethodType (enum) | NO | CUSTOM | z.enum | M8 |
| icon | String? | YES | — | z.string().max(50) | legacy `icone` |
| color | String? | YES | — | z.string().max(20) | legacy `cor` |
| active | Boolean | NO | true | z.boolean() | legacy `ativo` |
| order | Int | NO | 0 | z.number().int() | legacy `ordem` |
| acceptsInstallments | Boolean | NO | false | z.boolean() | legacy `aceita_parcelas` |
| minInstallments | Int? | YES | — | z.number().int().min(2) | legacy `parcelas_min` |
| maxInstallments | Int? | YES | — | z.number().int().max(36) | legacy `parcelas_max` |
| receivingDays | Int? | YES | — | z.number().int().min(0) | legacy `prazo_recebimento_dias` |
| nfeCode | String? | YES | — | z.string().max(5) | M8 (código SEFAZ para NF-e) |
| notes | String? @db.Text | YES | — | z.string() | legacy `observacoes` |
| createdAt | DateTime @default(now()) | NO | now() | — | padrão |
| updatedAt | DateTime @updatedAt | NO | — | — | padrão |

**Índices:** `@@unique([tenantId, code])`
**RLS:** Sim
**Constraint:** Se type=FIXED, code é imutável e registro não pode ser deletado (apenas desativado). // M8

### 3.6 PaymentMethodRate

Taxa por forma de pagamento, num_parcelas e contexto. Substitui `FormaPagamentoTaxa` do legacy.

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem |
|-------|-------------|----------|---------|---------------|--------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão |
| tenantId | String @db.Uuid | NO | — | — | RLS |
| paymentMethodId | String @db.Uuid | NO | — | — | FK → PaymentMethod |
| installments | Int | NO | 1 | z.number().int().min(1).max(36) | legacy `parcelas` |
| feePercent | Decimal @db.Decimal(6,3) | NO | 0 | z.number().min(0).max(100) | legacy `taxa_percentual` |
| feeFixed | Int | NO | 0 | z.number().int().min(0) | legacy `taxa_fixa` (centavos) |
| receivingDays | Int? | YES | — | z.number().int().min(0) | legacy `prazo_recebimento_dias` |
| appliesTo | AppliesTo (enum) | NO | BOTH | z.enum | legacy `aplica_em` |
| feePolicy | FeePolicy (enum) | NO | STORE_ABSORBS | z.enum | legacy `politica_taxa` |
| active | Boolean | NO | true | z.boolean() | legacy `ativo` |
| createdAt | DateTime @default(now()) | NO | now() | — | padrão |
| updatedAt | DateTime @updatedAt | NO | — | — | padrão |

**Índices:** `@@unique([tenantId, paymentMethodId, installments, appliesTo])`
**Relação:** belongsTo PaymentMethod (onDelete: Cascade)
**RLS:** Sim

### 3.7 InstallmentRate

Tabela de juros por parcela (substitui ConfiguracaoParcelamento 36 colunas). // M2

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem |
|-------|-------------|----------|---------|---------------|--------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão |
| tenantId | String @db.Uuid | NO | — | — | RLS |
| numberOfInstallments | Int | NO | — | z.number().int().min(2).max(36) | legacy `juros_Xx` (coluna N → linha N) |
| rate | Decimal @db.Decimal(6,3) | NO | 0 | z.number().min(0).max(100) | legacy valor da coluna `juros_Xx` |
| paymentMethodId | String? @db.Uuid | YES | — | — | FK opcional → PaymentMethod (NULL = global) |
| active | Boolean | NO | true | z.boolean() | novo |
| createdAt | DateTime @default(now()) | NO | now() | — | padrão |
| updatedAt | DateTime @updatedAt | NO | — | — | padrão |

**Índices:** `@@unique([tenantId, numberOfInstallments, paymentMethodId])`
**RLS:** Sim

### 3.8 Enums

```prisma
enum PaymentMethodType {
  FIXED    // Formas fixas do sistema (Dinheiro, PIX, Cartão Crédito, Cartão Débito)
  CUSTOM   // Formas customizadas pelo tenant
}

enum AppliesTo {
  DEVICE       // Aparelho — legacy 'aparelho'
  NON_DEVICE   // Não-aparelho — legacy 'nao_aparelho'
  BOTH         // Ambos — legacy 'ambos'
}

enum FeePolicy {
  STORE_ABSORBS   // Loja absorve a taxa — legacy 'loja_absorve'
  CUSTOMER_PAYS   // Cliente paga acréscimo — legacy 'cliente_paga_acrescimo'
}

enum TaxRegime {
  SIMPLES_NACIONAL  // 1
  LUCRO_PRESUMIDO   // 2
  LUCRO_REAL        // 3
}
```

---

## 4. Telas

### 4.1 Página principal `/settings` (com tabs)

**Acesso:** read para todos os papéis autenticados. // M7
**Fonte:** legacy ConfiguracaoController@index — tabs na mesma página.

**Tabs:**
| Tab | Rota | Edit access | Origem |
|-----|------|-------------|--------|
| Geral | /settings/general | Manager, Owner | legacy `configuracoes.index` tab geral |
| Assistência | /settings/assistance | Manager, Owner | legacy `configuracoes.index` tab assistência |
| Fiscal | /settings/fiscal | Owner APENAS | legacy `configuracoes.fiscal` |
| Pagamento | /settings/payment | Owner APENAS | legacy `configuracoes.pagamento` |
| Parcelamento | /settings/installments | Owner APENAS | legacy `admin.parcelamento.index` |
| Recebimento | /settings/receiving | Owner APENAS | novo (ConfiguracaoRecebimento) |

### 4.2 Tab Geral — `/settings/general`

**Acesso edit:** Manager, Owner // M7

**Campos do form:**
| Campo | Label PT | Required | Input | Origem |
|-------|----------|----------|-------|--------|
| tradeName | Nome fantasia | Sim | text | key-value `nome_loja` |
| legalName | Razão social | Não | text | novo |
| cnpj | CNPJ | Não | CnpjInput (máscara) | key-value `cnpj_loja` |
| phone | Telefone | Não | PhoneInput (máscara) | key-value `telefone_loja` |
| email | E-mail | Não | email input | ConfigAssistencia |
| logoUrl | Logo | Não | Upload imagem (PNG/JPG, max 2MB) | key-value `logo_loja` |
| zipCode | CEP | Não | CepInput com ViaCEP (M6, ADR 0009) | key-value via `endereco_loja` |
| street | Logradouro | Não | text | ADR 0007 |
| streetNumber | Número | Não | text | ADR 0007 |
| complement | Complemento | Não | text | ADR 0007 |
| neighborhood | Bairro | Não | text | ADR 0007 |
| city | Cidade | Não | text | ADR 0007 |
| state | Estado | Não | select UF | ADR 0007 |
| warrantyNewMonths | Garantia aparelho novo (meses) | Sim | number | key-value `garantia_aparelho_novo` |
| warrantyUsedMonths | Garantia aparelho seminovo (meses) | Sim | number | key-value `garantia_aparelho_seminovo` |
| businessHours | Horário de funcionamento | Não | text | ConfigAssistencia |

**Upload de logo:**
- Accept: image/png, image/jpeg
- Max: 2MB
- Preview da imagem atual
- Upload → MinIO bucket `arenatech`, path `tenants/{tenantId}/logo.{ext}`
- Retorna URL pública assinada

### 4.3 Tab Assistência — `/settings/assistance`

**Acesso edit:** Manager, Owner // M7

**Campos:**
| Campo | Label PT | Required | Input | Origem |
|-------|----------|----------|-------|--------|
| termsOfService | Termos de serviço | Não | textarea grande | legacy `termos_servico` |
| warrantyPolicy | Política de garantia | Não | textarea grande | legacy `politica_garantia` |

### 4.4 Tab Fiscal — `/settings/fiscal`

**Acesso edit:** Owner APENAS // M7

**Campos:**
| Campo | Label PT | Required | Input | Origem |
|-------|----------|----------|-------|--------|
| legalName | Razão social (fiscal) | Não | text | `fiscal_razao_social` |
| tradeName | Nome fantasia (fiscal) | Não | text | `fiscal_nome_fantasia` |
| cnpj | CNPJ emitente | Não | CnpjInput | `fiscal_cnpj` |
| ie | Inscrição estadual | Não | text | `fiscal_inscricao_estadual` |
| cnae | CNAE | Não | text | `fiscal_cnae` |
| taxRegime | Regime tributário | Sim | select (SN/LP/LR) | `fiscal_regime_tributario` |
| Endereço | (completo com ViaCEP) | Não | CepInput + campos | `fiscal_cep/logradouro/...` |
| municipalityCode | Código município IBGE | Não | text | `fiscal_codigo_municipio` |
| nfeEnvironment | Ambiente NF-e | Sim | select (Produção/Homologação) | `fiscal_nfe_ambiente` |
| nfeSeries | Série NF-e | Sim | text | `fiscal_nfe_serie` |
| nfceSeries | Série NFC-e | Sim | text | `fiscal_nfce_serie` |
| defaultCsosn | CSOSN padrão | Não | text | `fiscal_csosn_padrao` |
| enabled | NF-e habilitada | — | toggle | `fiscal_habilitado` |
| autoIssue | Emitir NF-e automaticamente | — | toggle | `fiscal_emitir_nf_automatico` |
| certificado | Certificado digital (.pfx) | Não | upload file | `fiscal_certificado_path` |

**Upload de certificado (M4):**
1. Aceita .pfx (application/x-pkcs12)
2. Pede senha do certificado via dialog (para validar parse)
3. Tenta abrir o .pfx com a senha fornecida (validação)
4. Se válido: extrai data de expiração, mostra ao usuário
5. Encripta o arquivo .pfx antes de subir ao MinIO
6. Armazena URL no `certificateUrl`, datas em `certificateUploadedAt`/`certificateExpiresAt`
7. NÃO armazena a senha — será pedida novamente pelo módulo Fiscal ao usar

### 4.5 Tab Pagamento — `/settings/payment`

**Acesso edit:** Owner APENAS // M7

**Layout:**
1. **Seção "Formas de pagamento fixas"** (4 cards no topo):
   - Dinheiro (code: DINHEIRO, nfeCode: '01')
   - PIX (code: PIX, nfeCode: '17')
   - Cartão de Crédito (code: CARTAO_CREDITO, nfeCode: '03')
   - Cartão de Débito (code: CARTAO_DEBITO, nfeCode: '04')
   - Cada card tem: toggle ativo/inativo, campo de prazo de recebimento
   - NÃO pode deletar, NÃO pode renomear code

2. **Seção "Formas customizadas"** (DataTable):
   - Colunas: Nome, Código, Ativo, Parcelas, Ordem, Ações
   - Ações: Editar, Desativar/Ativar, Excluir
   - Botão "Adicionar forma de pagamento"

3. **Seção "Taxas por forma"** (expandível por forma):
   - Tabela editável: parcelas | taxa % | taxa fixa | aplica em | política
   - Botão "Adicionar taxa"

### 4.6 Tab Parcelamento — `/settings/installments`

**Acesso edit:** Owner APENAS // M7

**Layout:**
- Tabela editável com N linhas (2x até 36x)
- Colunas: Parcelas | Taxa (%) | Ativa
- Se paymentMethodId definido, filtrar por forma
- Salvar em batch (botão "Salvar tabela")
- Botão "Resetar para padrão" (zero em todas)

// origem: legacy ParcelamentoController@index — tabela de juros_2x a juros_36x

### 4.7 Tab Recebimento — `/settings/receiving`

**Acesso edit:** Owner APENAS // M7

**Campos:**
| Campo | Label PT | Required | Input | Origem |
|-------|----------|----------|-------|--------|
| defaultPolicyDevice | Política padrão (aparelhos) | Sim | select | legacy `politica_default_aparelho` |
| defaultPolicyNonDevice | Política padrão (outros) | Sim | select | legacy `politica_default_nao_aparelho` |
| minInstallmentAmount | Valor mínimo para parcelamento | Sim | MoneyInput | legacy `valor_minimo_parcelamento` |
| requireCpfAbove | Exigir CPF acima de | Sim | MoneyInput | legacy `exige_cpf_acima_de` |
| autoCloseTime | Horário fechamento automático caixa | Não | time input (HH:MM) | legacy `hora_fechamento_automatico` |
| monthlySalesGoal | Meta mensal de vendas | Não | MoneyInput | legacy `meta_mensal_vendas` |
| defaultDasRate | Alíquota DAS padrão (%) | Não | number (decimal) | legacy `aliquota_das_padrao` |
| defaultIcmsDiffRate | Alíquota ICMS diferencial (%) | Não | number (decimal) | legacy `aliquota_icms_diferencial_padrao` |

---

## 5. Regras de negócio

| # | Regra | Origem |
|---|-------|--------|
| RN-1 | Configurações são singleton por tenant — upsert pattern (criar se não existe, atualizar se existe). | arquitetura |
| RN-2 | Editar tabs Fiscal, Pagamento, Parcelamento e Recebimento exige role Owner. Manager recebe 403 ao tentar salvar. | M7 |
| RN-3 | Editar tabs Geral e Assistência exige role Manager ou Owner. Operators recebem 403. | M7 |
| RN-4 | Todos os papéis autenticados podem LER todas as tabs (read). | M7 |
| RN-5 | Formas de pagamento fixas (DINHEIRO, PIX, CARTAO_CREDITO, CARTAO_DEBITO) são criadas automaticamente no seed de novo tenant. | M8 |
| RN-6 | Formas fixas NÃO podem ser deletadas — apenas desativadas (active=false). | M8 |
| RN-7 | Code de forma fixa é imutável. Tentativa de alterar retorna erro. | M8 |
| RN-8 | Code de forma customizada é gerado a partir do nome (slugify: uppercase, underscores). Unique por tenant. | M8 |
| RN-9 | Ao desativar uma forma de pagamento, ela para de aparecer no PDV/OS/Caixa. Registros históricos mantêm referência. | legacy `formasPagamentoAtivas()` |
| RN-10 | Taxa de parcelamento (InstallmentRate) com paymentMethodId=null aplica como taxa global. Com paymentMethodId definido, sobrescreve a global para aquela forma. | M2 + legacy ConfiguracaoParcelamento |
| RN-11 | Certificado digital (.pfx) é encriptado antes do upload ao MinIO. Chave de criptografia em variável de ambiente (CERTIFICATE_ENCRYPTION_KEY). | M4 |
| RN-12 | Senha do certificado NÃO é armazenada no banco. Apenas validada no momento do upload. | M4 |
| RN-13 | Ao fazer upload de novo certificado, o anterior é substituído (sobrescreve URL). | M4 |
| RN-14 | Upload de logo aceita apenas PNG/JPEG, máximo 2MB. Imagem é salva no MinIO path `tenants/{tenantId}/logo.{ext}`. | legacy logo_loja |
| RN-15 | PaymentMethodRate com appliesTo=BOTH é fallback: se existe taxa específica para DEVICE ou NON_DEVICE, usa a específica; senão usa BOTH. | legacy FormaPagamentoTaxa.taxaPara() |
| RN-16 | Valor mínimo de parcelamento: se valor da venda/OS < minInstallmentAmount, não permite parcelar. | legacy ConfiguracaoRecebimento |
| RN-17 | Exigir CPF: se valor da venda > requireCpfAbove, campo CPF é obrigatório no PDV. | legacy ConfiguracaoRecebimento |
| RN-18 | Auto-close time: se definido, job fecha caixas abertos no horário configurado. | legacy `hora_fechamento_automatico` |

---

## 6. Permissões

// origem: M7

| Ação | operator | technician | manager | owner |
|------|----------|------------|---------|-------|
| Ler qualquer tab | ✓ | ✓ | ✓ | ✓ |
| Editar Geral | ✗ | ✗ | ✓ | ✓ |
| Editar Assistência | ✗ | ✗ | ✓ | ✓ |
| Editar Fiscal | ✗ | ✗ | ✗ | ✓ |
| Editar Pagamento | ✗ | ✗ | ✗ | ✓ |
| Editar Parcelamento | ✗ | ✗ | ✗ | ✓ |
| Editar Recebimento | ✗ | ✗ | ✗ | ✓ |
| Upload logo | ✗ | ✗ | ✓ | ✓ |
| Upload certificado | ✗ | ✗ | ✗ | ✓ |
| Criar/editar/desativar forma pagamento | ✗ | ✗ | ✗ | ✓ |

---

## 7. Validações

### TenantGeneral
| Campo | Regra | Origem |
|-------|-------|--------|
| tradeName | required, max:255 | key-value (global, sempre exibido) |
| cnpj | optional, validateCNPJ | mudança (validação real) |
| phone | optional, max:20 | legacy |
| email | optional, email format | novo |
| state | optional, exactly 2 chars, uppercase | ADR 0007 |
| warrantyNewMonths | required, int, 0-120 | key-value |
| warrantyUsedMonths | required, int, 0-120 | key-value |

### TenantFiscalSettings
| Campo | Regra | Origem |
|-------|-------|--------|
| taxRegime | required, enum 1-3 | legacy |
| nfeEnvironment | required, 1 ou 2 | legacy |
| nfeSeries | required, max:3 | legacy |
| nfceSeries | required, max:3 | legacy |
| cnpj | optional, validateCNPJ | legacy |
| municipalityCode | optional, 7 dígitos | legacy |

### PaymentMethod
| Campo | Regra | Origem |
|-------|-------|--------|
| name | required, max:100, unique(tenantId, name) | legacy `rotulo` |
| code | required, max:50, unique(tenantId, code), imutável se FIXED | M8 |
| nfeCode | optional, max:5 | M8 |

### InstallmentRate
| Campo | Regra | Origem |
|-------|-------|--------|
| numberOfInstallments | required, int, 2-36 | M2 |
| rate | required, decimal, 0-100 | M2 |
| unique(tenantId, numberOfInstallments, paymentMethodId) | | M2 |

---

## 8. Integrações

### 8.1 ViaCEP (M6)
Mesmo padrão de Clientes (ADR 0009): `CepInput` com `onAddressFound` na tab Geral e Fiscal.

### 8.2 MinIO
- **Logo:** bucket `arenatech`, path `tenants/{tenantId}/logo.{ext}`
  - Upload via presigned PUT URL
  - Leitura via presigned GET URL (ou URL pública se bucket público)
- **Certificado digital:** bucket `arenatech`, path `tenants/{tenantId}/certificates/{uuid}.pfx.enc`
  - Encriptado com AES-256-GCM antes do upload
  - Chave: `CERTIFICATE_ENCRYPTION_KEY` (env var)
  - Decifragem acontece APENAS no módulo Fiscal ao emitir NF-e

### 8.3 Sem integrações externas (M3)
Módulo Fiscal é o consumidor das configurações. Configurações não faz chamadas à SEFAZ nem a Nuvem Fiscal.

---

## 9. Fluxos completos

### Fluxo 1: Editar dados gerais com upload de logo
1. Owner acessa /settings/general
2. Form carrega dados atuais via tRPC `settings.getGeneral`
3. Owner edita campos desejados
4. Owner seleciona nova imagem de logo
5. Submit → tRPC `settings.updateGeneral`
6. Server: valida campos, faz upload do logo no MinIO (se mudou), salva URL, upsert TenantGeneral
7. Toast "Configurações atualizadas"

### Fluxo 2: Upload de certificado digital (.pfx)
1. Owner acessa /settings/fiscal
2. Clica "Enviar certificado"
3. Dialog abre: campo file (.pfx) + campo senha
4. Owner seleciona arquivo e digita senha
5. Submit → tRPC `settings.uploadCertificate`
6. Server:
   a) Tenta parsear o .pfx com a senha (validação)
   b) Se falhar → erro "Senha inválida ou certificado corrompido"
   c) Se ok → extrai data de expiração
   d) Encripta arquivo com AES-256-GCM (env CERTIFICATE_ENCRYPTION_KEY)
   e) Upload para MinIO
   f) Salva certificateUrl, certificateUploadedAt, certificateExpiresAt
7. UI mostra: "Certificado válido até DD/MM/YYYY"

### Fluxo 3: Configurar formas de pagamento
1. Owner acessa /settings/payment
2. Vê 4 formas fixas (toggle ativo/inativo) + tabela de customizadas
3. Clica "Adicionar forma de pagamento"
4. Dialog: nome (obrigatório), aceita parcelas (toggle), min/max parcelas, prazo recebimento
5. Código gerado automaticamente (slugify do nome)
6. Submit → tRPC `settings.createPaymentMethod`
7. Forma aparece na tabela
8. Owner pode expandir forma → editar taxas (PaymentMethodRate)

### Fluxo 4: Editar tabela de parcelamento
1. Owner acessa /settings/installments
2. Tabela exibe 35 linhas (2x a 36x) com campo taxa % editável
3. Owner edita taxas desejadas
4. Clica "Salvar tabela" → tRPC `settings.updateInstallmentRates` (batch upsert)
5. Toast "Tabela de parcelamento atualizada"

### Fluxo 5: Editar políticas de recebimento
1. Owner acessa /settings/receiving
2. Form com campos de TenantReceivingSettings
3. Edita e salva → tRPC `settings.updateReceiving`

---

## 10. Casos de erro

| Cenário | Comportamento | Mensagem | Origem |
|---------|---------------|----------|--------|
| Manager tenta editar tab Fiscal | 403 Forbidden | "Apenas proprietários podem alterar configurações fiscais" | M7 |
| Operator tenta editar tab Geral | 403 Forbidden | "Apenas gerentes e proprietários podem alterar configurações gerais" | M7 |
| Upload logo > 2MB | Bloqueia | "Imagem deve ter no máximo 2MB" | RN-14 |
| Upload logo formato inválido | Bloqueia | "Formato inválido. Use PNG ou JPEG" | RN-14 |
| Upload .pfx com senha errada | Bloqueia | "Senha inválida ou certificado corrompido" | M4 |
| Upload .pfx formato inválido | Bloqueia | "Arquivo deve ser um certificado .pfx" | M4 |
| Tentar deletar forma fixa | Bloqueia | "Formas de pagamento fixas não podem ser excluídas" | M8, RN-6 |
| Tentar alterar code de forma fixa | Bloqueia | "Código de formas fixas é imutável" | M8, RN-7 |
| Code duplicado ao criar forma | Bloqueia | "Já existe forma de pagamento com este código" | RN-8 |
| InstallmentRate duplicada | Bloqueia | "Já existe taxa para X parcelas nesta forma" | unique constraint |

---

## 11. Testes E2E obrigatórios

| # | Cenário | Regra |
|---|---------|-------|
| T-1 | Editar dados gerais como Owner → sucesso | RN-1 |
| T-2 | Editar dados gerais como Manager → sucesso | RN-3 |
| T-3 | Editar dados gerais como Operator → 403 | RN-3 |
| T-4 | Editar tab Fiscal como Owner → sucesso | RN-2 |
| T-5 | Editar tab Fiscal como Manager → 403 | RN-2 |
| T-6 | Upload logo PNG válido → aparece preview | RN-14 |
| T-7 | Upload logo > 2MB → erro | RN-14 |
| T-8 | Upload certificado .pfx com senha correta → mostra expiração | M4, RN-11 |
| T-9 | Upload certificado com senha errada → erro | M4, RN-12 |
| T-10 | Desativar forma fixa (PIX) → não aparece no PDV | RN-6, RN-9 |
| T-11 | Tentar deletar forma fixa → erro | RN-6 |
| T-12 | Criar forma customizada → código gerado | RN-8 |
| T-13 | Deletar forma customizada → sucesso | permitido |
| T-14 | Salvar tabela parcelamento → taxas persistem | Fluxo 4 |
| T-15 | CEP preenchido → ViaCEP auto-fill endereço | M6 |
| T-16 | RLS: tenant A não vê configurações de tenant B | RLS |
| T-17 | Seed de novo tenant cria 4 formas fixas automaticamente | RN-5 |

---

## 12. Performance e limites

- Configurações são lidas com frequência por OS/PDV/Fiscal — considerar cache em Redis (per-tenant, invalidação ao salvar via tRPC mutation).
- PaymentMethods por tenant: máximo realista ~20 formas.
- InstallmentRates por tenant: máximo 35 linhas (2x-36x) × ~5 formas = ~175 registros. Trivial.
- Upload de logo e certificado via presigned URLs (não passa pelo Next.js server, direto para MinIO).

---

## 13. Anti-escopo (NÃO replicar)

| # | Feature removida | Justificativa |
|---|------------------|---------------|
| 1 | `fiscal_api_token` (token Focus NFe) | Sistema novo usa apenas Nuvem Fiscal |
| 2 | `fiscal_certificado_senha` (plaintext no banco) | Inseguro. Senha não armazenada no novo (M4) |
| 3 | Naming via key-value genérico | Substituído por modelos tipados (M1) |
| 4 | 36 colunas `juros_Xx` | Substituído por InstallmentRate relacional (M2) |
| 5 | ConfiguracaoParcelamento model | Substituído por InstallmentRate |
| 6 | Importar/Exportar configurações | Não existe no legacy, não adicionamos |
| 7 | Configurações de Recompensas (13 chaves `recompensas*`) | Será especificado no módulo Recompensas (Fase 14) |

---

## 14. Dependências cruzadas

### Configurações é CONSUMIDO por:

| Módulo | O que lê | Modelo |
|--------|----------|--------|
| PDV | Formas de pagamento ativas, taxa por parcela, política taxa, min parcelamento, exigir CPF, garantia | PaymentMethod, PaymentMethodRate, TenantReceivingSettings, TenantGeneral |
| OS | Termos de serviço, garantia padrão, dados da loja para PDF | TenantAssistanceSettings, TenantGeneral |
| Fiscal | Dados emitente completos, certificado (URL encriptado), série, CSOSN, ambiente | TenantFiscalSettings |
| Caixa | Hora fechamento automático, formas de pagamento | TenantReceivingSettings, PaymentMethod |
| Financeiro | DAS, ICMS diferencial, política taxa | TenantReceivingSettings, PaymentMethodRate |
| Comunicação | Dados da loja (nome, telefone) para templates de mensagem | TenantGeneral |
| Simulador | Tabela de parcelamento, formas de pagamento | InstallmentRate, PaymentMethod |
| Comissões | Alíquotas DAS/ICMS para cálculo líquido | TenantReceivingSettings |
| Layout global | Logo, nome fantasia (navbar, sidebar) | TenantGeneral |

### Configurações NÃO depende de nenhum outro módulo (é folha na árvore de dependências).

---

## 15. Stubs / Contratos para módulos consumidores

```typescript
// Contrato que outros módulos importam de Configurações:

interface TenantGeneralService {
  get(tenantId: string): Promise<TenantGeneral>;
  getLogoUrl(tenantId: string): Promise<string | null>;
}

interface PaymentMethodService {
  getActive(tenantId: string): Promise<PaymentMethod[]>;
  getByCode(tenantId: string, code: string): Promise<PaymentMethod | null>;
  getRateFor(tenantId: string, paymentMethodId: string, installments: number, appliesTo: AppliesTo): Promise<PaymentMethodRate | null>;
}

interface InstallmentRateService {
  getRate(tenantId: string, installments: number, paymentMethodId?: string): Promise<number>;
  getAll(tenantId: string): Promise<InstallmentRate[]>;
}

interface FiscalSettingsService {
  get(tenantId: string): Promise<TenantFiscalSettings | null>;
  getCertificateUrl(tenantId: string): Promise<string | null>;
  // Decifragem do certificado NÃO está aqui — fica no módulo Fiscal
}

interface ReceivingSettingsService {
  get(tenantId: string): Promise<TenantReceivingSettings>;
}

interface AssistanceSettingsService {
  get(tenantId: string): Promise<TenantAssistanceSettings>;
}
```
