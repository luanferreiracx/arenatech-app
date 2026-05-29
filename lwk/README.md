# LWK Depix Wallet · Portainer Deploy

Carteira Liquid (L-BRL / Depix) baseada na biblioteca **lwk** exposta como API REST.

---

## Estrutura

```
lwk/
├── app.py               # API Flask (endpoints REST)
├── requirements.txt     # Dependências Python
├── Dockerfile           # Imagem Docker
├── docker-compose.yml   # Stack para Portainer (lê do .env)
├── .env.example         # Modelo de configuração — copie para .env
├── dashboard.html       # Interface web opcional
└── wallet_data/         # (gitignored) mnemonic/descriptor — NUNCA versionar
```

> **Segurança:** `wallet_data/` contém o mnemonic da carteira. Está no
> `.gitignore` e `.dockerignore` — nunca entra no repo nem na imagem.

---

## 1. Build da imagem

### Opção A — Build local (servidor com Docker)
```bash
docker build -t lwk-depix-wallet:latest .
```

### Opção B — Build via Portainer
No Portainer, vá em **Images → Build** e aponte para este diretório.

---

## 2. Deploy

### Local / servidor com Docker
```bash
cp .env.example .env   # preencha API_KEY, WEBHOOK_URL, etc
docker compose up -d --build
```

### Portainer via Stack
1. Acesse **Stacks → Add stack → Web editor**
2. Cole o conteúdo do `docker-compose.yml`
3. Em **Environment variables**, defina (no mínimo):
   - `API_KEY` → chave forte (obrigatório)
   - `WEBHOOK_URL` → endpoint que recebe os depósitos
   - `NETWORK` → `mainnet` ou `testnet`
4. Clique em **Deploy the stack**

---

## 3. Endpoints da API

| Método | Rota            | Auth | Descrição                                      |
|--------|-----------------|------|------------------------------------------------|
| GET    | `/`             | não  | Info geral                                     |
| GET    | `/health`       | não  | Probe — 200 só se wallet + Esplora ok (503 se degradado) |
| GET    | `/status`       | sim  | Status da carteira e config                    |
| POST   | `/address/new`  | sim  | Gera endereço de recebimento                   |
| GET    | `/balance`      | sim  | Saldo DePix e todos os ativos                  |
| POST   | `/transfer`     | sim  | Transfere DePix (suporta `Idempotency-Key`)    |
| GET    | `/transactions` | sim  | Histórico de transações                        |
| GET    | `/wallet/info`  | sim  | Info da rede/asset (NÃO expõe descriptor)      |

> **`/transfer` idempotente:** envie o header `Idempotency-Key: <uuid>`. Se a
> mesma key chegar de novo (ex.: retry por timeout), a API devolve o txid já
> transmitido em vez de transferir de novo. Essencial para o PDV não duplicar saque.

> **Webhook assinado:** cada POST de depósito leva `X-Signature: sha256=<hmac>`
> (HMAC-SHA256 do corpo com `WEBHOOK_SECRET`). O receptor (PDV) deve recalcular
> e comparar antes de confiar no payload. Há retry com backoff (3 tentativas).

---

## 4. Exemplos de uso (curl)

### Gerar endereço de recebimento
```bash
curl -X POST http://localhost:5000/address/new \
  -H "Content-Type: application/json" \
  -H "X-API-Key: SUA_CHAVE" \
  -d '{}'
```

### Consultar saldo
```bash
curl http://localhost:5000/balance \
  -H "X-API-Key: SUA_CHAVE"
```

### Transferir Depix
```bash
curl -X POST http://localhost:5000/transfer \
  -H "Content-Type: application/json" \
  -H "X-API-Key: SUA_CHAVE" \
  -d '{
    "to": "VJL...",
    "amount": 10.50,
    "fee_rate": 0.1
  }'
```

### Listar transações
```bash
curl "http://localhost:5000/transactions?limit=10" \
  -H "X-API-Key: SUA_CHAVE"
```

---

## 5. Segurança

- O arquivo `mnemonic.txt` fica no volume Docker `/app/wallet_data`
- **NUNCA exponha** esse arquivo externamente
- Use `API_KEY` para proteger todos os endpoints
- Em produção, coloque um **reverse proxy** (Nginx/Traefik) com HTTPS na frente

---

## 6. Asset ID do DePix

DePix ("Decentralized Pix", issuer `depix.info`, precision 8) na Liquid mainnet:
```
02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189
```

Verifique sempre em https://blockstream.info/liquid/asset/02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189

---

## 7. Dashboard Web

Abra `dashboard.html` no browser, configure a URL da API e a API Key.
Permite gerar endereços, consultar saldo e transferir via interface gráfica.
