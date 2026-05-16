# ASSUMPTIONS — Configurações

## A1. ConfiguracaoAssistencia campos de identidade mesclados em TenantGeneral

**Premissa:** Os campos duplicados entre `ConfiguracaoAssistencia` (nome_assistencia, cnpj, telefone, email, endereço, cep, cidade, estado, logo_path) e o key-value (nome_loja, cnpj_loja, telefone_loja, logo_loja, endereco_loja) são a mesma informação. No novo sistema, ficam apenas em TenantGeneral. TenantAssistanceSettings guarda apenas os termos textuais.
**Razão:** Eliminar duplicação que causava inconsistência no legacy (nome_loja ≠ nome_assistencia possível).
**Reversível:** Sim, pode separar de novo se surgirem cenários que exijam dados diferentes.

## A2. Valores monetários em centavos (Int)

**Premissa:** `minInstallmentAmount`, `requireCpfAbove`, `monthlySalesGoal` armazenados como Int em centavos (multiplica por 100). Alinhado com padrão de MoneyInput do design system.
**Razão:** Evita problemas de floating point. Padrão já estabelecido em Sale, ServiceOrder, FinancialTransaction.
**Reversível:** Sim, mas quebraria consistência com resto do sistema.

## A3. PaymentMethodRate substitui FormaPagamentoTaxa com mesma granularidade

**Premissa:** O legacy tem `FormaPagamentoTaxa` com campos: parcelas, taxa_percentual, taxa_fixa, prazo_recebimento_dias, aplica_em (aparelho/não-aparelho/ambos), politica_taxa (loja absorve/cliente paga). Mantemos todos esses campos na PaymentMethodRate.
**Razão:** O sistema usa esses campos para calcular preço final no PDV e no simulador de parcelas.
**Reversível:** Sim.

## A4. InstallmentRate coexiste com PaymentMethodRate

**Premissa:** InstallmentRate é a "tabela de juros para o simulador" (antiga ConfiguracaoParcelamento — exibido na /simulador). PaymentMethodRate é a "taxa operacional real por forma de pagamento" (usada no PDV para calcular custo da operadora). São conceitos diferentes que coexistem.
**Razão:** No legacy, ConfiguracaoParcelamento (simulador) ≠ FormaPagamentoTaxa (operacional). Mantemos a separação.
**Reversível:** Sim (poderia unificar, mas perde clareza de propósito).

## A5. Certificado digital validado server-side em Node.js (não client-side)

**Premissa:** O parse do .pfx (extrair expiração, validar senha) acontece no server via `node-forge`. O arquivo bruto é enviado ao server, validado lá, encriptado, e depois upado para MinIO.
**Razão:** Segurança — chave privada não deve ser exposta no browser. Encriptação precisa de env var que não existe no client.
**Reversível:** Não (arquitetura fundamental de segurança).

## A6. Formas fixas criadas por seed/migration, não por código

**Premissa:** As 4 formas fixas são criadas no seed do tenant (quando um novo tenant é criado via Admin Central → approve). Não são hardcoded em código que roda em runtime.
**Razão:** Permite que o dono ajuste quais formas são "fixas" no futuro sem deploy. Dados no banco, não no código.
**Reversível:** Sim.

## A7. TaxRegime como Int (não enum Prisma)

**Premissa:** Regime tributário armazenado como Int (1, 2, 3) em vez de enum Prisma. O Zod valida contra enum, mas o banco guarda inteiro.
**Razão:** O código SEFAZ usa inteiros (CRT 1/2/3 no XML da NF-e). Armazenar como Int mantém compatibilidade direta com a API fiscal sem conversão.
**Reversível:** Sim (poderia usar enum e converter).
