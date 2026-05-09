# RUNBOOK -- Arena Tech

Documento operacional para deploy, monitoramento e cutover do sistema Arena Tech.

**VPS:** Contabo Ubuntu 24.04 LTS, 12 GB RAM, IP 194.34.232.81
**Dominio:** app.arenatechpi.com.br
**Stack:** Next.js 16 (standalone) + PostgreSQL 16 + Redis 7 + MinIO
**Deploy:** Docker Compose, porta interna 3001, Nginx reverse proxy

---

## Deploy

### Primeiro deploy (setup inicial)

1. Conectar na VPS:
   ```bash
   ssh deployer@194.34.232.81
   ```

2. Clonar repositorio:
   ```bash
   cd /home/deployer
   git clone https://github.com/<owner>/arenatech-app.git
   cd arenatech-app
   ```

3. Criar `.env.production` a partir do template:
   ```bash
   cp .env.production.example .env.production
   nano .env.production
   # Preencher TODAS as variaveis obrigatorias:
   # - NEXTAUTH_SECRET (openssl rand -base64 32)
   # - POSTGRES_PASSWORD
   # - REDIS_PASSWORD
   # - MINIO_ROOT_PASSWORD / S3_SECRET_KEY
   # - SUPERADMIN_CPF / SUPERADMIN_PASSWORD
   ```

4. Subir stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

5. Aguardar containers healthy:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```

6. Aplicar migrations:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy
   ```

7. Executar seed (super admin + tenant arena-tech):
   ```bash
   docker compose -f docker-compose.prod.yml exec -T app node prisma/seed.js
   ```

8. Instalar Nginx config:
   ```bash
   sudo cp deploy/nginx/app.arenatechpi.com.br.conf /etc/nginx/sites-available/
   sudo ln -sf /etc/nginx/sites-available/app.arenatechpi.com.br.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

9. Testar:
   ```bash
   curl -s https://app.arenatechpi.com.br | head -5
   ```

### Deploy subsequente (automatico via GitHub Actions)

1. Push para `main`
2. CI valida: lint, typecheck, test, build
3. Deploy via SSH:
   - `git pull origin main`
   - `docker compose build app`
   - `docker compose up -d`
   - `prisma migrate deploy`

### Deploy manual (se CI/CD estiver fora)

```bash
ssh deployer@194.34.232.81
cd /home/deployer/arenatech-app
git pull origin main
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy
```

### Rollback

```bash
ssh deployer@194.34.232.81
cd /home/deployer/arenatech-app

# Opcao A: Revert do ultimo commit
git revert HEAD
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d

# Opcao B: Voltar para commit especifico
git log --oneline -10  # identificar commit bom
git checkout <commit-hash>
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d
```

**ATENCAO:** Se a migration criou tabelas/colunas novas, pode ser necessario migration de rollback manual.

---

## Monitoramento

### Logs

```bash
# App (Next.js)
docker logs arenatech-app -f
docker logs arenatech-app --tail 100

# PostgreSQL
docker logs arenatech-postgres-prod -f

# Redis
docker logs arenatech-redis-prod -f

# MinIO
docker logs arenatech-minio-prod -f

# Nginx
sudo tail -f /var/log/nginx/arenatech-app-access.log
sudo tail -f /var/log/nginx/arenatech-app-error.log
```

### Health check

```bash
# App respondendo
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/

# PostgreSQL
docker exec arenatech-postgres-prod pg_isready -U arenatech

# Redis
docker exec arenatech-redis-prod redis-cli ping

# Containers rodando
docker compose -f docker-compose.prod.yml ps

# Uso de recursos
docker stats --no-stream
```

### Alertas manuais

Verificar diariamente na primeira semana apos go-live:
- Logs de erro: `docker logs arenatech-app 2>&1 | grep -i error | tail -20`
- Espaco em disco: `df -h /`
- Uso de memoria: `free -h`
- Conexoes PostgreSQL: `docker exec arenatech-postgres-prod psql -U arenatech -c "SELECT count(*) FROM pg_stat_activity;"`

---

## Backup

### PostgreSQL — backup manual

```bash
# Backup completo
docker exec arenatech-postgres-prod pg_dump -U arenatech arenatech \
  > /home/deployer/backups/arenatech_$(date +%Y%m%d_%H%M%S).sql

# Backup comprimido
docker exec arenatech-postgres-prod pg_dump -U arenatech arenatech \
  | gzip > /home/deployer/backups/arenatech_$(date +%Y%m%d_%H%M%S).sql.gz
```

### PostgreSQL — restore

```bash
# Restore a partir de dump
docker exec -i arenatech-postgres-prod psql -U arenatech arenatech \
  < /home/deployer/backups/arenatech_20260508.sql
```

### PostgreSQL — backup automatico (crontab)

```bash
# Adicionar ao crontab do deployer:
# crontab -e
0 3 * * * docker exec arenatech-postgres-prod pg_dump -U arenatech arenatech | gzip > /home/deployer/backups/arenatech_$(date +\%Y\%m\%d).sql.gz
# Manter ultimos 30 dias:
0 4 * * * find /home/deployer/backups -name "arenatech_*.sql.gz" -mtime +30 -delete
```

### MinIO — backup de objetos

```bash
# Instalar mc (MinIO Client) se necessario
docker exec arenatech-minio-prod mc alias set local http://localhost:9000 arenatech <senha>
docker exec arenatech-minio-prod mc mirror local/arenatech-app /tmp/minio-backup/
```

---

## Migracao de dados (cutover)

### Pre-cutover (1-2 dias antes)

1. Avisar usuarios sobre janela de manutencao
2. Testar script de migracao com dados reais em ambiente de teste:
   ```bash
   MYSQL_URL="mysql://user:pass@localhost:3306/arena_dev" \
   DATABASE_URL="postgresql://arenatech:pass@localhost:5434/arenatech" \
   tsx scripts/migrate-data.ts --dry-run
   ```
3. Verificar contagens e validar mapeamento
4. Backup completo do MySQL Laravel:
   ```bash
   mysqldump -u root -p arena_dev > backup_laravel_pre_cutover.sql
   ```

### Cutover (janela de manutencao)

1. **Colocar Laravel em maintenance mode:**
   ```bash
   cd /var/www/arenatechpi.com.br/intranet-laravel
   sudo -u www-data php artisan down --message="Sistema em manutencao para atualizacao"
   ```

2. **Backup final do MySQL:**
   ```bash
   mysqldump -u root -p arena_dev > backup_laravel_final.sql
   ```

3. **Rodar script de migracao:**
   ```bash
   cd /home/deployer/arenatech-app
   MYSQL_URL="mysql://user:pass@localhost:3306/arena_dev" \
   DATABASE_URL="postgresql://arenatech:pass@postgres:5432/arenatech" \
   tsx scripts/migrate-data.ts
   ```

4. **Validar contagens:**
   ```bash
   # Comparar totais MySQL vs PostgreSQL
   # MySQL:
   mysql -u root -p arena_dev -e "SELECT COUNT(*) FROM clientes;"
   # PostgreSQL:
   docker exec arenatech-postgres-prod psql -U arenatech -c "SELECT COUNT(*) FROM customers;"
   ```

5. **Testar sistema novo:**
   - Login com super admin
   - Verificar clientes migrados
   - Verificar OS migradas
   - Verificar produtos/estoque
   - Criar uma OS de teste
   - Testar PDV

6. **Confirmar go-live:**
   - Se OK: manter Laravel em maintenance mode
   - Se problemas: `php artisan up` no Laravel e investigar

### Pos-cutover

1. **Monitorar logs intensivamente por 48h**
2. **Manter Laravel disponivel (read-only) por 1 semana:**
   ```bash
   # Nao remover maintenance mode imediatamente
   # Deixar acessivel apenas para consulta se necessario
   ```
3. **Apos 1 semana sem problemas:**
   - Remover server block do Laravel para subdominio `intranet.*`
   - OU redirecionar `intranet.arenatechpi.com.br` → `app.arenatechpi.com.br`
4. **Apos 1 mes:**
   - Desligar containers/servicos do Laravel
   - Manter backup do MySQL por 6 meses

---

## Troubleshooting

### Container nao sobe

```bash
# Ver logs do container com erro
docker compose -f docker-compose.prod.yml logs app
docker compose -f docker-compose.prod.yml logs postgres

# Verificar .env.production esta acessivel
ls -la .env.production

# Rebuildar do zero
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build --no-cache app
docker compose -f docker-compose.prod.yml up -d
```

### Erro de conexao com banco

```bash
# Verificar se PostgreSQL esta rodando
docker exec arenatech-postgres-prod pg_isready -U arenatech

# Testar conexao de dentro do container app
docker exec arenatech-app sh -c 'nc -z postgres 5432 && echo OK || echo FAIL'

# Verificar DNS interno Docker
docker exec arenatech-app sh -c 'getent hosts postgres'
```

### Erro 502 Bad Gateway no Nginx

```bash
# Verificar se app esta respondendo na porta 3001
curl -s http://127.0.0.1:3001/

# Verificar Nginx config
sudo nginx -t

# Verificar se porta 3001 esta em LISTEN
ss -tlnp | grep 3001
```

### Disco cheio

```bash
# Verificar uso
df -h /

# Limpar imagens Docker antigas
docker image prune -a

# Limpar logs antigos
docker system prune --volumes

# Verificar tamanho dos backups
du -sh /home/deployer/backups/
```

### Migration falhou

```bash
# Ver status das migrations
docker compose -f docker-compose.prod.yml exec -T app npx prisma migrate status

# Se migration corrompida, pode ser necessario:
# 1. Backup do banco
# 2. Corrigir a migration
# 3. Marcar como aplicada: prisma migrate resolve --applied <migration_name>
```
