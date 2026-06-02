# Adicionar um novo domínio (landing + intranet)

Procedimento para colocar um novo domínio no ar servindo a **mesma app**
(mesma intranet/banco), com landing pública na raiz e login no próprio domínio.
Referência: feito para `pdvdepix.app` em 2026-06-01.

> Pré-requisitos: o domínio já registrado e a zona adicionada no Cloudflare
> (nameservers apontando pro Cloudflare).

## 1. Código (uma linha)

Adicione o host em `src/lib/brand-host.ts` → `PDVDEPIX_HOSTS`:

```ts
const PDVDEPIX_HOSTS = new Set([
  "pdvdepix.app", "www.pdvdepix.app",
  "pdvcripto.app", "www.pdvcripto.app",   // <- novo
]);
```

Isso já faz a raiz `/` desse host mostrar a landing (rewrite no `proxy.ts`).
Commit + push (deploy automático). Nada mais no código:
- `trustHost: true` no NextAuth (`src/server/auth.ts`) já faz login/callbacks
  usarem o host da requisição — **sem redirect pro arenatechpi**.
- A landing (`src/app/(marketing)/landing/page.tsx`) é a mesma para todos.

## 2. DNS no Cloudflare (painel)

- Registro **A**: `dominio.app` → **194.34.232.81**. Remova qualquer AAAA órfão.
- **Para emitir o cert**, deixe TEMPORARIAMENTE em **DNS only** (nuvem cinza).

## 3. Nginx + Let's Encrypt na VPS

Crie o server block (HTTP-only primeiro) espelhando o do pdvdepix:

```bash
ssh contabo
sudo cp /etc/nginx/sites-available/pdvdepix.app.conf \
        /etc/nginx/sites-available/DOMINIO.conf
sudo sed -i 's/pdvdepix\.app/DOMINIO/g' /etc/nginx/sites-available/DOMINIO.conf
# remova o bloco 443 e as linhas ssl_* (o certbot recria); deixe so o server :80
sudo ln -sf /etc/nginx/sites-available/DOMINIO.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Emita o cert (com o proxy CF em DNS-only, HTTP-01 alcança a VPS):

```bash
sudo certbot --nginx -d DOMINIO \
  --non-interactive --agree-tos -m luanferreiracx@gmail.com --redirect
```

> Inclua `-d www.DOMINIO` só se existir registro DNS para o `www` (senão falha
> com NXDOMAIN — foi o que aconteceu com pdvdepix). Renovação é automática
> (cron do certbot).

## 4. Religar o Cloudflare

- DNS do domínio: **DNS only → Proxied** (nuvem cinza → laranja).
- SSL/TLS → Overview: **Full (strict)** (a origin agora tem cert válido).

## 5. Validação

```bash
curl -sI https://DOMINIO/            # 200, server: cloudflare
curl -s https://DOMINIO/ | grep -o "pdvdepix"   # landing aparece
curl -sI https://DOMINIO/login       # 200 no proprio dominio (sem Location p/ arenatechpi)
```

## Gotchas

- **HTTP-01 falha com proxy CF ligado** → sempre emitir em DNS-only e religar depois.
- **`www` sem DNS** → não passe `-d www.*` ou o certbot falha o lote inteiro.
- **AAAA órfão** → se o domínio tiver AAAA apontando pra lugar errado, remova
  (a origin responde por IPv4).
- O **deploy do CI** (`git reset --hard`) não toca no Nginx nem nos certs — eles
  vivem fora do repo, na VPS. Mudança de código só precisa do push.
