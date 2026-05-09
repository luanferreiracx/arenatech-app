/**
 * migrate-data.ts — Script de migração MySQL (Laravel) → PostgreSQL (Next.js)
 *
 * NÃO roda automaticamente — executado manualmente pelo dono no dia do cutover.
 *
 * Pré-requisitos:
 * 1. PostgreSQL com schema aplicado (prisma migrate deploy)
 * 2. Acesso ao MySQL do Laravel (MYSQL_URL)
 * 3. DATABASE_URL apontando para o PostgreSQL de destino
 *
 * Uso:
 *   MYSQL_URL="mysql://user:pass@host:3306/arenatech_master" \
 *   DATABASE_URL="postgresql://arenatech:pass@localhost:5434/arenatech" \
 *   tsx scripts/migrate-data.ts [--dry-run]
 *
 * Flags:
 *   --dry-run   Apenas conta registros, não insere nada
 */

// ---------------------------------------------------------------------------
// Mapeamento de tabelas MySQL → PostgreSQL
// ---------------------------------------------------------------------------
//
// Apenas o tenant central "Arena Tech" será migrado.
// Tenants filhos (sb-phone, new-loja) NÃO são migrados — novos tenants
// se cadastram pelo fluxo de pré-cadastro.
//
// Banco central (arenatech_master):
//   tenants          → tenants            (apenas arena-tech)
//   usuarios (central) → users + user_tenants
//   planos           → plans
//   precadastros     → pre_registrations
//
// Banco tenant (arena_dev ou equivalente):
//   clientes         → customers
//   servicos         → services
//   avaliacoes       → diagnostic_templates
//   aparelhos (*)    → devices
//   produtos         → products
//   produto_categorias → device_categories
//   fornecedores     → suppliers (se existir tabela no novo schema)
//   ordens_servico   → service_orders
//   ordens_servico_itens → service_order_items
//   ordens_servico_historico → service_order_histories
//   pdv_vendas       → sales
//   pdv_venda_itens  → sale_items
//   caixas + caixa_aberturas → cash_registers
//   caixa_movimentacoes → cash_movements
//   contas_receber + parcelas → financial_transactions + installments
//   contas_pagar + parcelas   → financial_transactions + installments
//   estoque_movimentacoes → stock_movements
//   interesses_clientes → customer_interests
//   configuracoes_assistencia → tenant_settings
//   configuracoes_parcelamento → installment_rules
//   entregadores → delivery_persons
//   comissoes_regras → commission_rules
//   nfe_emitidas → invoices
//   nfe_emitidas_itens → invoice_items
//
// ---------------------------------------------------------------------------
// Mapeamento de campos (exemplos principais)
// ---------------------------------------------------------------------------
//
// clientes → customers:
//   id (auto-increment)    → id (uuid, gerado)
//   nome_completo          → name
//   cpf                    → cpf (normalizado, sem pontos)
//   celular_whatsapp       → phone
//   celular_alternativo    → (campo notes ou descartado)
//   email                  → email
//   cep,logradouro,...     → address (JSONB)
//   ativo                  → deletedAt (ativo=false → deletedAt=now)
//   criado_em              → createdAt
//   atualizado_em          → updatedAt
//
// ordens_servico → service_orders:
//   id (auto-increment)    → id (uuid, gerado)
//   numero_os (string)     → number (int, extrair numérico)
//   cliente_id             → customerId (lookup por cpf)
//   tecnico_responsavel_id → technicianId (lookup por cpf)
//   status (pt)            → status (enum EN mapeado)
//   valor_servico          → (item de serviço)
//   valor_pecas            → (itens de peça)
//   valor_total            → totalAmount
//   checklist_* (30 cols)  → checklist (JSONB)
//   historico_status (JSON) → service_order_histories (normalizado)
//   criado_em              → createdAt
//
// Status mapping:
//   iniciada              → DRAFT
//   em_diagnostico        → IN_DIAGNOSIS
//   aprovada              → APPROVED
//   aguardando_pecas      → AWAITING_PARTS
//   em_execucao           → IN_PROGRESS
//   concluida             → COMPLETED
//   paga                  → PAID
//   aguardando_retirada   → AWAITING_PICKUP
//   em_garantia           → IN_WARRANTY
//   cancelada             → CANCELLED
//   estornada             → REFUNDED
//
// produtos → products:
//   codigo_interno         → code
//   nome                   → name
//   preco_custo            → costPrice
//   preco_venda            → salePrice
//   quantidade_estoque     → currentStock
//   estoque_minimo         → minimumStock
//   ncm                    → ncm
//   codigo_barras          → barcode
//   imagem_url             → imageUrl (migrar de Cloudinary para MinIO)
//
// ---------------------------------------------------------------------------
// Tipos que precisam de conversão
// ---------------------------------------------------------------------------
//
// MySQL datetime     → PostgreSQL timestamptz (adicionar timezone UTC)
// MySQL decimal      → PostgreSQL decimal (compatível)
// MySQL tinyint(1)   → PostgreSQL boolean
// MySQL enum         → PostgreSQL enum (via Prisma)
// MySQL auto_increment → PostgreSQL uuid (gerar novo)
// MySQL text/longtext → PostgreSQL text
// Valor string "R$ 1.500,00" → Decimal 1500.00
//
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";

const MYSQL_URL = process.env["MYSQL_URL"];
const DATABASE_URL = process.env["DATABASE_URL"];
const DRY_RUN = process.argv.includes("--dry-run");

if (!MYSQL_URL) {
  console.error("MYSQL_URL nao definida. Abortando.");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL nao definida. Abortando.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// TODO: Implementar antes do cutover real
// ---------------------------------------------------------------------------
//
// 1. Instalar mysql2: pnpm add -D mysql2
// 2. Criar conexão MySQL:
//    import mysql from "mysql2/promise";
//    const mysqlConn = await mysql.createConnection(MYSQL_URL);
//
// 3. Para cada tabela:
//    a. SELECT * FROM tabela_mysql
//    b. Transformar campos (mapeamento acima)
//    c. Gerar UUIDs para PKs
//    d. Manter mapa de IDs antigos → novos (para FKs)
//    e. INSERT no PostgreSQL via Prisma
//    f. Logar contagem e erros
//
// 4. Ordem de migração (respeitar FKs):
//    1. tenants (Arena Tech central)
//    2. users + user_tenants
//    3. tenant_settings
//    4. device_categories
//    5. devices
//    6. services
//    7. diagnostic_templates
//    8. products
//    9. customers
//   10. payment_methods + installment_rules
//   11. service_orders + items + histories
//   12. sales + sale_items
//   13. financial_transactions + installments
//   14. cash_registers + cash_movements
//   15. stock_movements
//   16. delivery_persons
//   17. commission_rules
//   18. invoices + invoice_items
//
// 5. Validação pós-migração:
//    - Comparar contagens (SELECT COUNT(*) em cada tabela)
//    - Verificar somas de valores financeiros
//    - Spot check: 10 OS aleatórias, comparar campos
//    - Verificar se todos os clientes com OS têm customer válido
//
// 6. Assets (imagens):
//    - Listar URLs do Cloudinary nos produtos
//    - Download + upload para MinIO
//    - Atualizar imageUrl nos produtos migrados
//
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Arena Tech — Migracao de Dados ===");
  console.log(`Modo: ${DRY_RUN ? "DRY RUN (sem escrita)" : "PRODUCAO"}`);
  console.log(`MySQL: ${MYSQL_URL?.replace(/:[^@]+@/, ":***@")}`);
  console.log(`PostgreSQL: ${DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);
  console.log("");

  const prisma = new PrismaClient();

  try {
    // Verificar conexão PostgreSQL
    await prisma.$queryRaw`SELECT 1`;
    console.log("[OK] Conexao PostgreSQL estabelecida");

    // TODO: Verificar conexão MySQL
    // const mysqlConn = await mysql.createConnection(MYSQL_URL);
    // console.log("[OK] Conexao MySQL estabelecida");

    // TODO: Executar migração tabela por tabela
    // await migrateTenants(mysqlConn, prisma);
    // await migrateUsers(mysqlConn, prisma);
    // await migrateCustomers(mysqlConn, prisma);
    // ... etc

    console.log("");
    console.log("=== Migracao concluida ===");
    console.log(
      "TODO: Implementar migração real antes do cutover. Este é um placeholder.",
    );
  } catch (error) {
    console.error("Erro na migracao:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Helpers (usar na implementação real)
// ---------------------------------------------------------------------------

/** Gera UUID v4 */
function generateUuid(): string {
  return crypto.randomUUID();
}

/** Converte valor monetário string "R$ 1.500,00" para número 1500.00 */
function parseMoneyString(value: string | null): number {
  if (!value) return 0;
  return Number(
    value
      .replace(/[R$\s]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
}

/** Normaliza CPF removendo pontos e traços */
function normalizeCpf(cpf: string | null): string | null {
  if (!cpf) return null;
  return cpf.replace(/\D/g, "").padStart(11, "0");
}

/** Mapeia status da OS do Laravel (pt) para o Next.js (enum) */
function mapServiceOrderStatus(
  laravelStatus: string,
): string {
  const statusMap: Record<string, string> = {
    iniciada: "DRAFT",
    em_diagnostico: "IN_DIAGNOSIS",
    aprovada: "APPROVED",
    aguardando_pecas: "AWAITING_PARTS",
    em_execucao: "IN_PROGRESS",
    concluida: "COMPLETED",
    paga: "PAID",
    aguardando_retirada: "AWAITING_PICKUP",
    em_garantia: "IN_WARRANTY",
    cancelada: "CANCELLED",
    estornada: "REFUNDED",
  };
  return statusMap[laravelStatus] ?? "DRAFT";
}

/** Converte campos de endereço do Laravel (colunas separadas) para JSONB */
function buildAddressJson(row: Record<string, unknown>): object | null {
  const cep = row["cep"] as string | null;
  if (!cep) return null;
  return {
    zipCode: cep,
    street: row["logradouro"] ?? "",
    number: row["numero"] ?? "",
    complement: row["complemento"] ?? "",
    neighborhood: row["bairro"] ?? "",
    city: row["cidade"] ?? "",
    state: row["estado"] ?? "",
  };
}

// Exportar helpers para uso em testes
export {
  generateUuid,
  parseMoneyString,
  normalizeCpf,
  mapServiceOrderStatus,
  buildAddressJson,
};

// Executar
main().catch(console.error);
