# Migração arena_dev (Laravel MySQL) → arenatech (Next.js Postgres)

Scripts executados em 2026-05-21 para migrar dados de produção do sistema Laravel legado para o novo Next.js.

## Pré-requisitos
- Acesso SSH ao VPS (`contabo`)
- MySQL `arena_dev` rodando localmente no VPS
- PostgreSQL `arenatech` no container `arenatech-postgres-prod`
- Tenant alvo: `dd308431-0525-417a-97c5-459e4b6cf45a` (Arena Tech)
- Super admin existente: `64472a4d-3063-495e-94ea-294e419e1e2d` (Luan)

## Ordem de execução

```bash
# Backup (idempotente, criado em /home/deployer/backups/pre-migration-YYYYMMDD/)
ssh contabo "mkdir -p /home/deployer/backups/pre-migration-\$(date +%Y%m%d) && cd \$_ && \
  docker exec arenatech-postgres-prod pg_dump -U arenatech -d arenatech --clean --if-exists --no-owner --no-acl | gzip > postgres-pre.sql.gz && \
  mysqldump --single-transaction --routines --triggers arena_dev | gzip > arena_dev-pre.sql.gz"

# Cleanup (apaga tudo do Postgres exceto tenants + super admins + plans + addons)
scp scripts/migration/00-cleanup.sql contabo:/tmp/
ssh contabo "docker exec -i arenatech-postgres-prod psql -U arenatech arenatech < /tmp/00-cleanup.sql"

# Fases 1-8 sequenciais
for f in scripts/migration/0{1..8}-*.sh; do
  name=$(basename "$f")
  echo "=== $name ==="
  scp "$f" contabo:/tmp/
  ssh contabo "bash /tmp/$name"
done
```

## Resultados esperados (snapshot 2026-05-21)

| Tabela | Linhas migradas |
|--------|----------------|
| users (Laravel → Next.js) | 14 + super admins |
| customers | 1255 |
| services | 96 |
| suppliers | 17 |
| product_categories | 57 |
| products | 692 |
| product_variations | 1950 |
| stock_items | 123 |
| service_orders | 167 |
| service_order_items | 175 |
| service_order_history | 1425 |
| sales | 1829 |
| sale_items | 1895 |
| financial_transactions | 671 |
| installments | 1137 |
| cash_registers | 294 |
| cash_movements | 1042 |

## O que NÃO foi migrado (adicional, futura sprint)

- **Avaliações** (`avaliacoes` → `device_valuations`) — 231 linhas
- **Recompensas** (`recompensas_acoes` → `reward_actions`) — 22 linhas
- **Comissões** (`comissao_apuracoes` etc.) — não usado na loja física
- **Compras de aparelhos** (`compras_aparelhos` → `device_purchases`) — 63 linhas
- **Interesses** (`interesses` → `interests`) — 57 linhas
- **Chatbot conversas** (`chatbot_*`) — vai recomeçar limpo
- **Imagens de produtos** (Cloudinary → MinIO) — script separado
- **Configurações** (assistencia, recebimento, fiscal, etc.) — preencher manualmente via UI

## Estratégia técnica

Cada fase segue o mesmo pattern:
1. Truncate tabelas alvo (idempotente)
2. Tabela `_map_<entity>` (BIGINT/INT → UUID) para resolver FKs entre fases
3. `mysql --batch --raw` → TSV → `awk` → SQL → `psql`
4. Texto longo: `REPLACE(REPLACE(col, '\r', ' '), '\n', ' ')` no MySQL para evitar quebra de TSV
5. SQLs grandes (CR/CP/items) em arquivo temp + `psql ON_ERROR_STOP=1`

### Mapeamento de status

**ServiceOrderStatus**: iniciada→OPEN, em_diagnostico→IN_DIAGNOSIS, aprovada→APPROVED, aguardando_aprovacao→WAITING_APPROVAL, aguardando_pecas→WAITING_PARTS, em_execucao→IN_PROGRESS, concluida→COMPLETED, paga→PAID, aguardando_retirada→READY_FOR_PICKUP, entregue→DELIVERED, em_garantia→IN_WARRANTY, cancelada→CANCELLED, estornada→REFUNDED.

**SaleStatus**: finalizada→COMPLETED, cancelada→CANCELLED, estornada→REFUNDED, estornada_parcial→PARTIALLY_REFUNDED, rascunho→DRAFT.

**TransactionStatus**: pendente→PENDING, paga→PAID, vencida→OVERDUE, cancelada→CANCELLED, parcial→PARTIALLY_PAID, estornada→ESTORNADA.

**PaymentMethodType**: dinheiro→CASH, pix/depix→PIX, cartao_credito/credito/parcelado→CREDIT_CARD, cartao_debito/debito→DEBIT_CARD, crediario→STORE_CREDIT.

**StockItemCondition**: novo→NEW, seminovo/usado→USED, defeito→DEFECTIVE.

**StockItemStatus**: disponivel→AVAILABLE, vendido→SOLD, reservado→RESERVED, defeito→DEFECTIVE, indisponivel→UNAVAILABLE.

**Role**: admin→owner, gerente→manager, tecnico→technician, caixa→cashier, outro→operator.

## Limitações conhecidas

- **CPFs vazios/duplicados**: viraram NULL (134 clientes sem CPF) ou apenas o primeiro do duplicado fica com CPF.
- **Phone vazio em customers**: virou string vazia (campo NOT NULL no Postgres).
- **Sale items sem produto**: usaram placeholder `00000000-0000-0000-0000-000000000001` "[Item avulso]".
- **Senhas dos usuários**: hash bcrypt preservado — usuários logam com mesma senha Laravel.

## Rollback

```bash
ssh contabo "gunzip -c /home/deployer/backups/pre-migration-20260521/postgres-pre.sql.gz | docker exec -i arenatech-postgres-prod psql -U arenatech arenatech"
```
