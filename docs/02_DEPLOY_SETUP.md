# 02 — DEPLOY SETUP (GitHub Actions + VPS)

Pipeline de deploy: push direto na `main` → testes obrigatórios via GitHub Actions → deploy automático na Contabo se passar.

**Pré-requisito:** `01_DEV_LOCAL_SETUP.md` concluído.

---

## Visão geral

```
[ MAC ]                  [ GITHUB ]                   [ VPS CONTABO ]
                                                      
git push                 Actions: pre-receive          
  ────────────────────►  ┌────────────────────┐        
                         │ lint               │        
                         │ typecheck          │        
                         │ test (Vitest)      │        
                         │ test:e2e (Playwright)│      
                         │ build              │        
                         │ prisma validate    │        
                         └─────────┬──────────┘        
                                   │ tudo ok           
                                   ▼                    
                         Actions: deploy job           
                         ssh deploy@vps               
                            git pull               ───►
                            pnpm install --prod      
                            pnpm db:migrate deploy   
                            pnpm build               
                            pm2 reload arenatech-app 
                                                    ✓ deploy concluído
                         arena-notify (no Mac)
```

---

## Parte 1 — Setup da VPS Contabo

### 1.1 Conectar e instalar dependências base

```bash
ssh contabo

apt update && apt upgrade -y
apt install -y curl wget git build-essential ca-certificates gnupg lsb-release \
  software-properties-common unzip nano htop tmux jq ufw fail2ban
```

### 1.2 Instalar Node.js 22

```bash
# nvm como root (vai rodar o app como user dedicado depois)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 22
nvm alias default 22

# pnpm e pm2 globais
npm install -g pnpm pm2
```

### 1.3 PostgreSQL 16

```bash
# Repositório oficial do PostgreSQL
sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt update
apt install -y postgresql-16 postgresql-contrib-16

systemctl enable postgresql
systemctl start postgresql

# Configurar usuário e banco
sudo -u postgres psql << 'EOF'
CREATE USER arenatech WITH PASSWORD 'TROCAR_ESTA_SENHA_FORTE';
ALTER USER arenatech WITH CREATEDB;
CREATE DATABASE arenatech OWNER arenatech;
GRANT ALL PRIVILEGES ON DATABASE arenatech TO arenatech;
\q
EOF
```

> **IMPORTANTE:** troque `TROCAR_ESTA_SENHA_FORTE` por uma senha real forte. Salve no seu gerenciador de senhas. Vai precisar dela no `.env` da VPS.

### 1.4 Redis 7

```bash
add-apt-repository ppa:redislabs/redis -y
apt update
apt install -y redis

systemctl enable redis-server
systemctl start redis-server

# Configurar senha
REDIS_PASS=$(openssl rand -hex 32)
echo "REDIS_PASS=$REDIS_PASS" >> /root/.arenatech-secrets
echo "requirepass $REDIS_PASS" >> /etc/redis/redis.conf
systemctl restart redis-server

cat /root/.arenatech-secrets  # ANOTE essa senha
```

### 1.5 MinIO

```bash
# Download
wget https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/local/bin/minio
chmod +x /usr/local/bin/minio

# Usuário e diretórios
useradd -r minio-user -s /sbin/nologin
mkdir -p /var/lib/minio/data
chown -R minio-user:minio-user /var/lib/minio

# Credenciais
MINIO_ROOT_USER=arenatech-admin
MINIO_ROOT_PASSWORD=$(openssl rand -hex 32)
echo "MINIO_USER=$MINIO_ROOT_USER" >> /root/.arenatech-secrets
echo "MINIO_PASS=$MINIO_ROOT_PASSWORD" >> /root/.arenatech-secrets

# Config
mkdir -p /etc/minio
cat > /etc/default/minio << EOF
MINIO_VOLUMES="/var/lib/minio/data"
MINIO_OPTS="--console-address :9001"
MINIO_ROOT_USER=$MINIO_ROOT_USER
MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD
EOF

# Service
cat > /etc/systemd/system/minio.service << 'EOF'
[Unit]
Description=MinIO
Documentation=https://min.io/docs/minio/linux/index.html
Wants=network-online.target
After=network-online.target
AssertFileIsExecutable=/usr/local/bin/minio

[Service]
WorkingDirectory=/var/lib/minio
User=minio-user
Group=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=always
LimitNOFILE=65536
TimeoutStopSec=infinity
SendSIGKILL=no

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable minio
systemctl start minio
systemctl status minio
```

### 1.6 Nginx

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

Config do site (criamos depois que o app estiver rodando, na seção 4).

### 1.7 Certbot (SSL)

```bash
apt install -y certbot python3-certbot-nginx
```

### 1.8 Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

### 1.9 Usuário de deploy

Não é boa prática rodar deploy como `root`. Criamos um usuário dedicado:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy

# Diretório do projeto
mkdir -p /var/www/arenatechpi.com.br/arenatech-app
chown -R deploy:deploy /var/www/arenatechpi.com.br/arenatech-app

# nvm também para o user deploy
sudo -u deploy bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash'
sudo -u deploy bash -c 'export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh" && nvm install 22 && nvm alias default 22 && npm install -g pnpm pm2'
```

### 1.10 SSH key dedicada para deploy

Vamos criar uma chave SSH **só para o GitHub Actions** se conectar e fazer deploy. Não use a sua chave pessoal.

```bash
sudo -u deploy bash << 'EOF'
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -N "" -f ~/.ssh/github_deploy -C "github-actions@arenatech-app"
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo ""
echo "═══ CHAVE PRIVADA (copie INTEIRA pra GitHub Secrets como DEPLOY_SSH_KEY) ═══"
cat ~/.ssh/github_deploy
echo "═══ FIM DA CHAVE ═══"
EOF
```

**Copie a chave privada que apareceu.** Você vai colar nos Secrets do GitHub na Parte 2.

### 1.11 Verificar todas as senhas/credenciais

```bash
cat /root/.arenatech-secrets
```

Anote tudo no seu gerenciador de senhas. Você vai precisar para os Secrets do GitHub e o `.env` da produção.

---

## Parte 2 — Configurar GitHub Actions

### 2.1 No Mac, dentro do projeto

```bash
cd ~/dev/arenatech-app
mkdir -p .github/workflows
```

### 2.2 Workflow de CI (validação)

```bash
cat > .github/workflows/ci.yml << 'EOF'
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  validate:
    name: Validate (lint + types + tests + build)
    runs-on: ubuntu-latest
    timeout-minutes: 20

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: arenatech
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: arenatech_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm prisma generate
        env:
          DATABASE_URL: postgresql://arenatech:testpass@localhost:5432/arenatech_test

      - name: Validate Prisma schema
        run: pnpm prisma validate
        env:
          DATABASE_URL: postgresql://arenatech:testpass@localhost:5432/arenatech_test

      - name: Run migrations
        run: pnpm prisma migrate deploy
        env:
          DATABASE_URL: postgresql://arenatech:testpass@localhost:5432/arenatech_test

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Unit tests
        run: pnpm test
        env:
          DATABASE_URL: postgresql://arenatech:testpass@localhost:5432/arenatech_test
          REDIS_URL: redis://localhost:6379
          NEXTAUTH_SECRET: test-secret-do-not-use-in-prod
          NEXTAUTH_URL: http://localhost:3000

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: Build
        run: pnpm build
        env:
          DATABASE_URL: postgresql://arenatech:testpass@localhost:5432/arenatech_test
          REDIS_URL: redis://localhost:6379
          NEXTAUTH_SECRET: test-secret-do-not-use-in-prod
          NEXTAUTH_URL: http://localhost:3000

      - name: E2E tests (rotas críticas)
        run: pnpm test:e2e
        env:
          DATABASE_URL: postgresql://arenatech:testpass@localhost:5432/arenatech_test
          REDIS_URL: redis://localhost:6379
          NEXTAUTH_SECRET: test-secret-do-not-use-in-prod
          NEXTAUTH_URL: http://localhost:3000

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
EOF
```

### 2.3 Workflow de Deploy

```bash
cat > .github/workflows/deploy.yml << 'EOF'
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy to Contabo
    runs-on: ubuntu-latest
    needs: []

    # Só roda se o CI da mesma sha passou
    # (GitHub Actions encadeia naturalmente: deploy só inicia depois do CI)

    steps:
      - name: Wait for CI
        uses: lewagon/wait-on-check-action@v1.3.4
        with:
          ref: ${{ github.sha }}
          check-name: 'Validate (lint + types + tests + build)'
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          wait-interval: 15

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          port: 22
          script_stop: true
          script: |
            set -euo pipefail
            cd /var/www/arenatechpi.com.br/arenatech-app
            
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            
            echo "→ Pulling latest..."
            git fetch origin main
            git reset --hard origin/main
            
            echo "→ Installing deps..."
            pnpm install --frozen-lockfile --prod=false
            
            echo "→ Generating Prisma client..."
            pnpm prisma generate
            
            echo "→ Running migrations..."
            pnpm prisma migrate deploy
            
            echo "→ Building..."
            pnpm build
            
            echo "→ Reloading PM2..."
            pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
            pm2 save
            
            echo "✓ Deploy concluído"

      - name: Notify success
        if: success()
        run: echo "✓ Deploy concluído"

      - name: Notify failure
        if: failure()
        run: echo "✗ Deploy falhou"
EOF
```

### 2.4 Configurar Secrets no GitHub

```bash
# Da raiz do projeto
gh secret set DEPLOY_HOST -b "194.34.232.81"
gh secret set DEPLOY_USER -b "deploy"

# Cole a chave privada que você copiou na seção 1.10
gh secret set DEPLOY_SSH_KEY
# Cola o conteúdo INTEIRO da chave privada (incluindo BEGIN/END) e Ctrl+D
```

Verifica:
```bash
gh secret list
```

### 2.5 Branch protection (opcional mas recomendado)

```bash
# Requer status check do CI passar antes de aceitar push
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field required_status_checks[contexts][]='Validate (lint + types + tests + build)' \
  --field enforce_admins=false \
  --field required_pull_request_reviews= \
  --field restrictions= 2>/dev/null || echo "Configure manualmente em github.com/settings/branches"
```

Se o comando falhar, configure manualmente:
1. github.com → seu repo → Settings → Branches
2. Add rule para `main`
3. Marca **Require status checks to pass** + seleciona `Validate`
4. **Require branches to be up to date before merging**
5. Salva

Resultado: você pode `git push` direto na main, mas se os testes falharem, o GitHub rejeita o push.

---

## Parte 3 — PM2 (Process Manager) na VPS

Configuração que vai pro repo (commitada). Quando o app for criado na Fase 1, esse arquivo já estará lá:

```bash
cat > ~/dev/arenatech-app/ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [
    {
      name: 'arenatech-app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/arenatechpi.com.br/arenatech-app',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/pm2/arenatech-app-error.log',
      out_file: '/var/log/pm2/arenatech-app-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
EOF
```

Cria diretório de logs na VPS:

```bash
ssh contabo "mkdir -p /var/log/pm2 && chown -R deploy:deploy /var/log/pm2"
```

PM2 startup (sobe sozinho após reboot):

```bash
ssh contabo
sudo -u deploy bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
pm2 startup systemd -u deploy --hp /home/deploy
exit  # volta pra root

# Cole o comando que o pm2 startup mandou (geralmente env PATH... pm2 startup...)
# Ele instala um service do systemd
```

---

## Parte 4 — Nginx + SSL

### 4.1 Config do Nginx

Decisão sobre domínio: vamos usar `app.arenatechpi.com.br` para o novo, mantendo o Laravel atual no domínio raiz `arenatechpi.com.br` durante a migração.

```bash
ssh contabo

cat > /etc/nginx/sites-available/arenatech-app << 'EOF'
upstream arenatech_app {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name app.arenatechpi.com.br;

    # Para o Certbot validar
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Resto redireciona pra HTTPS depois que SSL estiver configurado
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name app.arenatechpi.com.br;

    # SSL (Certbot vai preencher)
    ssl_certificate /etc/letsencrypt/live/app.arenatechpi.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.arenatechpi.com.br/privkey.pem;
    
    ssl_session_timeout 1d;
    ssl_session_cache shared:MozSSL:10m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # Upload máximo (uploads de imagens, NF-e, etc)
    client_max_body_size 50M;

    # Logs
    access_log /var/log/nginx/arenatech-app-access.log;
    error_log /var/log/nginx/arenatech-app-error.log;

    # Headers de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy pro Next.js
    location / {
        proxy_pass http://arenatech_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300;
    }

    # Cache de assets estáticos do Next.js
    location /_next/static/ {
        proxy_pass http://arenatech_app;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
EOF

# Diretório do certbot
mkdir -p /var/www/certbot

# Habilitar
ln -s /etc/nginx/sites-available/arenatech-app /etc/nginx/sites-enabled/

# COMENTE temporariamente as linhas de SSL pra primeiro pegar o certificado
sed -i 's|^    ssl_certificate|    # ssl_certificate|g' /etc/nginx/sites-available/arenatech-app
sed -i '/listen 443/,/}/ s|^|# |' /etc/nginx/sites-available/arenatech-app
nginx -t
systemctl reload nginx
```

### 4.2 DNS no Cloudflare

Antes do certificado, **aponta `app.arenatechpi.com.br` no Cloudflare**:
- Type: `A`
- Name: `app`
- Content: `194.34.232.81`
- Proxy: **DESLIGADO** (nuvem cinza) durante a emissão do certificado. Religue depois.

### 4.3 Emitir certificado

```bash
certbot certonly --webroot -w /var/www/certbot \
  -d app.arenatechpi.com.br \
  --non-interactive --agree-tos -m luan@arenatechpi.com.br

# Descomenta o bloco SSL que comentamos
nano /etc/nginx/sites-available/arenatech-app
# remove os # das linhas de ssl_ e do bloco listen 443

nginx -t
systemctl reload nginx
```

### 4.4 Renovação automática

```bash
systemctl enable certbot.timer
systemctl start certbot.timer
```

---

## Parte 5 — Primeiro deploy de teste

Quando o app tiver código mínimo (na Fase 1), o primeiro deploy é assim:

### 5.1 No VPS, clonar pela primeira vez

```bash
ssh contabo
sudo -u deploy bash
cd /var/www/arenatechpi.com.br/arenatech-app

# Configurar git pra usar HTTPS com PAT (ou adicionar deploy key — recomendo PAT pra simplificar)
git clone https://github.com/SEU_USER/arenatech-app.git .
# Se der prompt de auth, gere um PAT no GitHub (Settings → Developer settings → Personal access tokens)
# E cola como password
```

### 5.2 .env de produção

```bash
cd /var/www/arenatechpi.com.br/arenatech-app
cat > .env << 'EOF'
NODE_ENV=production

# Database
DATABASE_URL=postgresql://arenatech:SENHA_QUE_VOCE_DEFINIU@localhost:5432/arenatech?schema=public

# Redis
REDIS_URL=redis://:SENHA_REDIS_QUE_VOCE_DEFINIU@localhost:6379

# NextAuth
NEXTAUTH_URL=https://app.arenatechpi.com.br
NEXTAUTH_SECRET=GERAR_COM_openssl_rand_-base64_32

# MinIO
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=arenatech-admin
S3_SECRET_KEY=SENHA_MINIO_QUE_VOCE_DEFINIU
S3_BUCKET=arenatech-app
S3_REGION=us-east-1

# === Integrações (preencher na Fase 0 a partir do .env do Laravel) ===
AUTENTIQUE_API_KEY=
PIXPAY_CLIENT_ID=
PIXPAY_CLIENT_SECRET=
NUVEM_FISCAL_API_KEY=
WHATSAPP_API_KEY=
RESEND_API_KEY=
EOF

chmod 600 .env
```

> **Geração do NEXTAUTH_SECRET:** rode `openssl rand -base64 32` e cole.

### 5.3 First run manual

```bash
export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh"
pnpm install
pnpm prisma generate
pnpm prisma migrate deploy
pnpm build
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

### 5.4 Testar pelo navegador

`https://app.arenatechpi.com.br` deve carregar. Se sim, deploy automatizado funcionará daqui em diante.

---

## Parte 6 — Smoke test do pipeline completo

Faz um commit bobo no Mac:

```bash
cd ~/dev/arenatech-app
echo "" >> README.md
git add README.md
git commit -m "test: smoke test do pipeline"
git push origin main
```

Acompanha:
```bash
gh run watch
```

Deve: rodar o CI → passar → disparar deploy → SSH na VPS → puxar código → reiniciar PM2 → arena-notify aparece no Mac. Total: ~3-5 min.

---

## Checklist da Parte 02

- [ ] PostgreSQL 16 instalado, banco `arenatech` criado, senha anotada
- [ ] Redis 7 instalado, senha anotada
- [ ] MinIO instalado, console em :9001 acessível, credenciais anotadas
- [ ] Nginx instalado
- [ ] Certbot instalado
- [ ] Firewall ativo (UFW)
- [ ] User `deploy` criado, com nvm/pnpm/pm2
- [ ] Chave SSH `github_deploy` criada, pública em `authorized_keys`, privada copiada
- [ ] DNS `app.arenatechpi.com.br` apontando pro IP
- [ ] Nginx config criado, certificado SSL emitido
- [ ] Workflows `ci.yml` e `deploy.yml` no projeto
- [ ] Secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` no GitHub
- [ ] Branch `main` protegida com status checks
- [ ] PM2 startup configurado
- [ ] `.env` de produção criado na VPS

Quando todos `✓`, prossiga para `03_CLAUDE_AUTONOMY.md`.
