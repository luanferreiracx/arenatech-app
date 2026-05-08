# VPS_INVENTORY.md — Diagnóstico Contabo (194.34.232.81)

> Diagnóstico read-only executado em 2026-05-08.
> Alias SSH: `contabo` | Usuário: `deployer` (www-data group)

---

## Resumo Executivo

| # | Situação |
|---|---|
| 1 | **Ubuntu 24.04 LTS** — OS moderno, sem necessidade de upgrade |
| 2 | **Node.js v20** instalado via apt (precisa upgrade para v22 para arenatech-app) |
| 3 | **PostgreSQL 16** disponível como imagem Docker (não como serviço nativo) — port 5432 **não exposto para o host**; precisará de container dedicado para o Next.js |
| 4 | **Redis 7** disponível em dois containers Docker (chatwoot e evolution-api), ambos **internos às redes Docker** — não acessíveis pelo host sem uma nova instância |
| 5 | **MinIO**: imagem baixada (`minio/minio:latest` presente), mas **nenhum container rodando** — precisa ser criado |

**Falta para o arenatech-app:** Node.js 22, pnpm, pm2, PostgreSQL acessível pelo host, Redis acessível pelo host, MinIO rodando.

---

## 1. Sistema Base

| Item | Valor |
|---|---|
| OS | Ubuntu 24.04.2 LTS (Noble Numbat) |
| Hostname | vmi2740315 |
| RAM Total | 11 GiB |
| RAM Usada | 3.5 GiB |
| RAM Livre | 6.2 GiB (8.2 GiB disponível com cache) |
| Swap | 2 GiB (512 KiB usada) |
| Disco / | 96 GB total, 36 GB usado (38%), 60 GB livre |
| Uptime | 22 dias |
| Load avg | 0.22 / 0.34 / 0.25 |

---

## 2. Linguagens e Runtimes

### PHP
```
PHP 8.3.30 (cli) — NTS, com Zend OPcache
```

**Módulos relevantes instalados:**
`bcmath`, `curl`, `gd`, `igbinary`, `intl`, `mbstring`, `mysqli`, `mysqlnd`, `openssl`, `pcntl`, `pdo_mysql`, `pdo_pgsql`, `pdo_sqlite`, `pgsql`, `redis`, `sockets`, `sodium`, `xml`, `zip`

> PHP-FPM 8.3 rodando via systemd, servindo o Laravel. Pool: `www.conf`.

### Node.js
```
v20.19.4 (instalado via apt em /usr/bin/node)
npm 10.8.2
```

> **NVM não instalado.** Node.js 22 LTS não está disponível.

### pnpm
```
NÃO INSTALADO
```

### pm2
```
NÃO INSTALADO
```

### Composer
```
Composer 2.8.10 (2025-07-10)
```

---

## 3. Bancos de Dados

### PostgreSQL

**Serviço nativo:** NÃO instalado no host.

**Disponível via Docker:**

| Container | Imagem | Porta exposta | Status |
|---|---|---|---|
| `chatwoot-postgres` | `pgvector/pgvector:pg15` | `127.0.0.1:5433→5432` | Up 3 semanas |
| `evolution-postgres` | `postgres:15-alpine` | não exposta ao host | Up 3 semanas |

**Imagem disponível (não rodando):**
- `postgres:16-alpine` — presente no Docker, mas **sem container ativo**

> PostgreSQL 16 para o arenatech-app precisará de um novo container Docker com porta dedicada (ex: 5434).

### MySQL

```
MySQL 8.0.45 (Ubuntu) — serviço nativo, rodando há 3 semanas
Porta: 127.0.0.1:3306 (não exposta externamente)
```

**Databases existentes:**
```
arena_dev
arenatech_master
information_schema
mail
mysql
performance_schema
sys
tenant_new-loja
tenant_sb-phone
vantagens_secretas
```

> Este é o banco do sistema Laravel atual. Não tocar.

### Redis

**Serviço nativo:** NÃO instalado no host. `redis-cli` não encontrado.

**Disponível via Docker:**

| Container | Imagem | Rede | Porta | Status |
|---|---|---|---|---|
| `chatwoot-redis` | `redis:7-alpine` | `chatwoot-net` (interna) | não exposta ao host | Up 3 semanas |
| `evolution-redis` | `redis:7-alpine` | `evolution-net` (interna) | não exposta ao host | Up 3 semanas |

> Redis para o arenatech-app precisará de um novo container com porta exposta ao host (ex: 6380 para não conflitar).

---

## 4. Storage

### MinIO

**Imagem Docker:** `minio/minio:latest` — **PRESENTE, mas nenhum container rodando.**

```
$ docker images | grep minio
minio/minio:latest   69b2ec208575   175MB
```

> Container MinIO nunca foi iniciado. Será necessário criar com docker-compose dedicado para o arenatech-app. Portas padrão: 9000 (API) e 9001 (console).

### Cloudinary

O sistema Laravel atual usa Cloudinary para imagens de produtos. Não há integração S3/MinIO ativa.

---

## 5. Web Server

### Nginx
```
nginx/1.24.0 (Ubuntu)
Rodando há 1 semana 3 dias (reiniciado em 2026-04-28)
```

**Sites ativos em `/etc/nginx/sites-enabled/`:**

| Arquivo/Link | Domínio(s) | Backend |
|---|---|---|
| `arenatechpi.com.br` (direto) | `arenatechpi.com.br`, `*.arenatechpi.com.br`, `intranet.*`, `catalogo.*`, `www.*` | PHP-FPM (Laravel) |
| `arenatechpi.com.br.bak` | (backup, carregado junto — duplicata!) | PHP-FPM |
| `atendimento.arenatechpi.com.br` | `atendimento.arenatechpi.com.br` | `127.0.0.1:3000` (Chatwoot) |
| `evolutionapi.arenatechpi.com.br` | `evolutionapi.arenatechpi.com.br` | `127.0.0.1:8085` (Evolution API) |
| `pay.arenatechpi.com.br` | `pay.arenatechpi.com.br` | `127.0.0.1:49392` (serviço desconhecido — **porta não em LISTEN atualmente**) |

**Observações importantes:**
- SSL via **Cloudflare Origin Certificate** (wildcard `*.arenatechpi.com.br`), válido até **2040-10-12** — não usa certbot para os domínios principais
- `arenatechpi.com.br.bak` está sendo carregado pelo Nginx (nome sem extensão `.conf.bak`), duplicando server blocks — **risco de conflito**
- `app.arenatechpi.com.br` **NÃO tem server block configurado** — DNS existe (Cloudflare proxy) mas sem configuração Nginx
- O regex no wildcard tenant exclui `app.` na versão nova mas não na `.bak` — inconsistência

### PHP-FPM
```
php8.3-fpm — rodando, 8 workers ociosos
Socket: unix:/var/run/php/php8.3-fpm.sock
Pool: www.conf (único pool)
```

---

## 6. Processos Rodando

### Serviços systemd ativos relevantes

| Serviço | Descrição |
|---|---|
| `nginx` | Reverse proxy |
| `php8.3-fpm` | Laravel backend |
| `mysql` | Banco de dados Laravel |
| `docker` | Container runtime |
| `supervisor` | Process manager para queue worker Laravel |
| `fail2ban` | Proteção SSH |
| `postfix` + `dovecot` + `opendkim` | Stack de email própria |
| `containerd` | Container runtime (base do Docker) |

### Containers Docker ativos

| Container | Imagem | Porta host | Uptime |
|---|---|---|---|
| `chatwoot-rails` | `chatwoot/chatwoot:v4.12.1` | `127.0.0.1:3000` | 3 dias |
| `chatwoot-postgres` | `pgvector/pgvector:pg15` | `127.0.0.1:5433` | 3 semanas |
| `chatwoot-redis` | `redis:7-alpine` | (interna) | 3 semanas |
| `chatwoot-sidekiq` | `chatwoot/chatwoot:latest` | (interna) | 3 semanas |
| `evolution-api` | `evoapicloud/evolution-api:v2.3.7` | `127.0.0.1:8085` | 3 semanas |
| `evolution-postgres` | `postgres:15-alpine` | (interna) | 3 semanas |
| `evolution-redis` | `redis:7-alpine` | (interna) | 3 semanas |

### Portas em LISTEN

| Porta | Processo | Acesso |
|---|---|---|
| `22` | sshd | público |
| `25`, `465`, `587` | postfix | público (email) |
| `80`, `443` | nginx | público |
| `110`, `143`, `993`, `995` | dovecot | público (email) |
| `3000` | docker-proxy → chatwoot-rails | apenas loopback |
| `3306` | mysqld | apenas loopback |
| `5433` | docker-proxy → chatwoot-postgres | apenas loopback |
| `8085` | docker-proxy → evolution-api | apenas loopback |
| `12301` | opendkim | apenas loopback |
| `33060` | mysqld (X Protocol) | apenas loopback |

> **Porta livre para Next.js:** qualquer porta não listada acima. Recomendado: `3001` (ou via Docker).

### pm2
```
NÃO INSTALADO
```

### Supervisor
```
arena-queue-worker_00   RUNNING   pid 1519442   (uptime ~23min no momento da consulta)
Comando: php artisan queue:work database --sleep=3 --tries=3 --backoff=30 --max-time=3600 --queue=default
Usuário: www-data
```

---

## 7. SSL / TLS

### Cloudflare Origin Certificate (wildcard)

| Arquivo | Cobertura | Válido até |
|---|---|---|
| `/etc/nginx/ssl/cloudflare-origin-wildcard.crt` | `*.arenatechpi.com.br` | **2040-10-12** |
| `/etc/nginx/ssl/cloudflare-origin.crt` | provavelmente `arenatechpi.com.br` | (não inspecionado) |

> Todo o tráfego passa pelo **Cloudflare como proxy** (os DNS de todos os subdomínios resolvem para `188.114.96.3 / 188.114.97.3`, que são IPs Cloudflare). O certificado Origin CA cobre o trecho Cloudflare → VPS.

### Let's Encrypt (certbot)

| Domínio | Válido até |
|---|---|
| `evolutionapi.arenatechpi.com.br` | 2026-07-24 (77 dias) |
| `vantagenssecretas.com.br` | 2026-07-04 (56 dias) |

> Nota: `evolutionapi` usa tanto Let's Encrypt quanto o Cloudflare Origin cert (o nginx usa o Cloudflare cert). O certbot certificate pode estar desatualizado/inutilizado.

### DNS de `app.arenatechpi.com.br`

```
dig app.arenatechpi.com.br +short
188.114.96.3
188.114.97.3
```

> `app.arenatechpi.com.br` **já está no DNS** com proxy Cloudflare ativo. Falta apenas o server block no Nginx.

---

## 8. Segurança

### UFW Firewall

```
Status: active (default deny incoming)
```

**Portas abertas:**

| Porta | Protocolo |
|---|---|
| 22 | SSH |
| 25 | SMTP |
| 80 | HTTP |
| 443 | HTTPS |
| 465 | SMTPS |
| 587 | Submission |

> Firewall bem configurado. Nenhum ajuste necessário para o Next.js (tráfego via Nginx na 443).

### Usuários com shell

| Usuário | UID | Home |
|---|---|---|
| `root` | 0 | `/root` |
| `vantagens` | 1000 | `/home/vantagens` |
| `deployer` | 1002 | `/home/deployer` |
| `sync` | 4 | `/bin` (built-in) |

---

## 9. App Laravel Atual

| Item | Valor |
|---|---|
| Diretório | `/var/www/arenatechpi.com.br/intranet-laravel/` |
| Git | **SIM** — `.git` presente |
| Proprietário | `deployer:www-data` (chmod 775) |
| PHP-FPM user | `www-data` |
| Queue worker | supervisor → `arena-queue-worker_00` (1 process) |
| Crontab | `deployer` e `root` ambos com o mesmo `php artisan schedule:run` (duplicado) |

**Crontab ativo (duplicado em deployer e root):**
```
* * * * * cd /var/www/arenatechpi.com.br/intranet-laravel && sudo -u www-data php artisan schedule:run >> /var/log/laravel-scheduler.log 2>&1
```

**Observações:**
- `arenatechpi.com.br.bak` em sites-enabled é um arquivo ativo, não só backup — **carrega server blocks duplicados**
- `pay.arenatechpi.com.br` aponta para porta 49392 que **não está em LISTEN** — serviço morto
- `/var/www/intranet/` existe com arquivos PHP para visualização de OS, recibos e termos de devolução (mini app PHP público)

---

## 10. DNS e Rede

```
app.arenatechpi.com.br      → 188.114.96.3 / 188.114.97.3  (Cloudflare proxy)
arenatechpi.com.br           → 188.114.97.3 / 188.114.96.3  (Cloudflare proxy)
intranet.arenatechpi.com.br  → 188.114.96.3 / 188.114.97.3  (Cloudflare proxy)
```

> **Todos** os domínios passam pelo Cloudflare. A VPS nunca recebe o IP real do cliente sem o header `CF-Connecting-IP`. O Nginx precisa confiar no Cloudflare para X-Forwarded-For.

---

## Tabela de Compatibilidade com arenatech-app

| Recurso necessário | Status | Ação requerida |
|---|---|---|
| Ubuntu 20+ | ✓ Ubuntu 24.04 LTS | Nenhuma |
| Docker | ✓ rodando | Nenhuma |
| Node.js 22 (LTS) | ✗ v20.19.4 instalado | Instalar v22 via NodeSource ou nvm |
| pnpm | ✗ não instalado | `npm install -g pnpm` após Node 22 |
| pm2 | ✗ não instalado | `npm install -g pm2` |
| PostgreSQL 16+ | ⚠ imagem presente, sem container | Criar container `arenatech-postgres` (porta 5434) |
| Redis 7+ | ⚠ presente em containers Docker isolados | Criar container `arenatech-redis` (porta 6380 no host) |
| MinIO | ⚠ imagem presente, sem container | Criar container `arenatech-minio` (portas 9000/9001) |
| Nginx reverse proxy | ✓ 1.24.0 rodando | Adicionar server block para `app.arenatechpi.com.br` |
| SSL para `app.arenatechpi.com.br` | ✓ wildcard Cloudflare cobre | Nenhuma — usar o mesmo `cloudflare-origin-wildcard.crt` |
| DNS `app.arenatechpi.com.br` | ✓ já aponta para a VPS via CF | Nenhuma |
| Disco livre | ✓ 60 GB disponíveis | Nenhuma |
| RAM disponível | ✓ 8.2 GiB disponíveis | Nenhuma |
| Firewall (ufw) | ✓ bem configurado | Nenhuma — Next.js atrás do Nginx |
| Usuário deployer | ✓ existe | Usar para deploy do Next.js |
| Email (transacional) | ⚠ postfix/dovecot rodando | Avaliar usar Resend (produção) ou postfix local (dev) |

---

## Decisões Pendentes (requerem aprovação humana)

### D1 — Estratégia de deploy do Next.js na VPS

Opções para rodar o arenatech-app:

- **A) Docker container** (recomendado): `docker-compose.yml` próprio com Next.js standalone, postgres 16, redis, minio. Consistente com os outros serviços.
- **B) PM2 direto no host**: Node.js 22 + pnpm + pm2. Mais simples, sem overhead Docker. `next start` via pm2.
- **C) Hybrid**: Next.js via PM2, dependências (postgres, redis, minio) via Docker.

**Pergunta:** Qual estratégia prefere?

---

### D2 — Porta e subdomínio do arenatech-app

`app.arenatechpi.com.br` está no DNS mas sem server block no Nginx. Precisamos definir:
- A porta interna que o Next.js vai escutar (sugestão: `3001` para não conflitar com Chatwoot em 3000)
- Confirmar que `app.arenatechpi.com.br` é o subdomínio correto para o novo sistema

**Pergunta:** Usa `app.arenatechpi.com.br` ou outro subdomínio? Porta 3001?

---

### D3 — Limpeza do arquivo `.bak` no Nginx

`/etc/nginx/sites-enabled/arenatechpi.com.br.bak` é um arquivo de configuração ativo (não é ignorado pelo Nginx) com server blocks duplicados. Isso é um risco de conflito.

**Pergunta:** Posso remover/renomear para `.bak.disabled` na próxima sessão de deploy?

---

### D4 — `pay.arenatechpi.com.br` morto

O site `pay.arenatechpi.com.br` aponta para a porta 49392 que não está em uso. Nginx serve 502 para esse domínio.

**Pergunta:** Esse serviço foi descontinuado? Posso remover o server block?

---

### D5 — Redis isolado vs compartilhado

O arenatech-app pode usar um dos Redis existentes (acessando a rede Docker interna) ou ter seu próprio container. Os existentes são privados às redes `chatwoot-net` e `evolution-net`.

**Recomendação:** Redis próprio (`arenatech-redis`) para isolamento.
**Pergunta:** Confirma Redis dedicado para o arenatech-app?

---

### D6 — PostgreSQL: porta para o container do arenatech-app

A porta 5432 não está exposta no host (evolution-postgres não está exposta). A porta 5433 está usada pelo chatwoot-postgres.

**Sugestão:** usar `127.0.0.1:5434:5432` para o arenatech-postgres.
**Pergunta:** OK com porta 5434 no host para o Postgres do Next.js?

---

### D7 — Crontab duplicado do Laravel

`deployer` e `root` ambos têm o mesmo `* * * * * ... php artisan schedule:run`. Isso executa o scheduler duas vezes por minuto.

**Pergunta:** Posso remover o crontab do `root` na próxima sessão?

---

### D8 — Versão do Node.js: sistema vs nvm

Node.js 22 pode ser instalado via:
- `NodeSource` (substitui o v20 do apt)
- `nvm` no usuário `deployer` (mantém v20 no sistema para outras coisas)

O Chatwoot e Evolution usam apenas containers Docker, então não dependem do Node.js do sistema.

**Recomendação:** nvm no usuário `deployer`, para isolamento.
**Pergunta:** OK com nvm para o deployer?

---

## Observações Técnicas Adicionais

- **Docker disk usage:** 18.79 GB em imagens, 13.22 GB reclaimáveis (imagens antigas não usadas). Pode liberar espaço com `docker image prune`.
- **Email stack:** Postfix + Dovecot + OpenDKIM rodando nativamente. O Laravel usa isso. Para o Next.js, usar Resend em produção (já mapeado no .env).
- **Cloudflare proxy mode:** Todos os subdomínios estão com proxy ativo (laranja no CF). O Nginx precisa processar o header `CF-Connecting-IP` para logs corretos.
- **`/var/www/intranet/`**: Mini app PHP standalone com 3 arquivos (visualização pública de OS, recibo, termo). Não interfere com o Next.js.
- **`vantagenssecretas.com.br`**: Domínio diferente hospedado na mesma VPS com cert Let's Encrypt próprio. Não interfere.
