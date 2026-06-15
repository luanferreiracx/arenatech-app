# 0051 — DePix Wallet: custódia non-custodial (seed cifrada com passphrase do usuário)

- **Status:** Proposto
- **Data:** 2026-06-15
- **Decisores:** Dono do produto + dev sênior (migração Arena Tech)
- **Contexto relacionado:** serviço LWK (`lwk/app.py`), orquestração de saque (`src/server/services/depix-transaction.service.ts`, `src/lib/services/lwk-service.ts`), cifragem AES-256-GCM já usada em 2FA ([[0049-login-turnstile-2fa]], `src/lib/auth/two-factor.ts`), pipeline de deploy com migration antes do app (PR #105).

---

## Contexto

Hoje a DePix wallet é **custodial**. O serviço LWK (container `arenatech-lwk-wallet`) gera o
mnemônico de 24 palavras de cada tenant e o grava **em texto puro** no volume
(`WALLET_DATA_DIR/{tenant_id}/mnemonic.txt`, chmod 0600). O Postgres guarda apenas o
descriptor público (watch-only) em `TenantDepixWallet` — a seed nunca esteve no banco,
justamente porque a custódia vivia no volume.

Duas consequências que o dono quer eliminar:

- Quem tiver acesso ao volume, a um backup dele, ou ao endpoint `/mnemonic/reveal`
  (protegido só pela `X-API-Key` global) pode gastar o saldo DePix de **todos** os tenants.
- O **superadmin consegue revelar a seed de qualquer tenant** — incômodo explícito do dono.

Queremos um modelo **non-custodial**: a seed só decifra com uma **passphrase que apenas o
usuário sabe** (separada da senha de login). O servidor guarda só o blob cifrado e **não
consegue assinar sozinho**. O dono aceitou o trade-off inerente: esquecer a passphrase
(e perder o backup do mnemônico) = **perda total dos fundos**; e o saque deixa de ser
"automático no balcão", passando a exigir a passphrase a cada operação.

### A tensão central

Três fluxos hoje assinam **sem usuário presente**, o que impede tornar 100% das carteiras
non-custodial sem quebrar a automação:

1. **Taxa Arena Tech no depósito** — `settleDepositConfirmed` dispara `lwk.transfer(...)` a
   partir do **webhook** do monitor LWK (assíncrono, sem sessão de usuário).
2. **Auto-refill de L-BTC** — `onWithdrawCompleted` → `ensureLbtcFor` assina na carteira do
   **tenant central** (`arena-tech`), pós-saque, fire-and-forget.
3. **Taxa Arena Tech no saque** — segundo recipient do mesmo `lwk.transfer` do
   `createWithdraw`; esse coincide com a presença do usuário, então usa a mesma passphrase.

A solução é **segmentar por papel da carteira** e isolar a cobrança de taxa.

## Decisão

Migrar para non-custodial de forma **faseada e opt-in por tenant**, com `custodyModel`
default `custodial` (nada quebra até cada tenant migrar conscientemente).

1. **Segmentação por papel.** Tenants **comuns** (onde vive o saldo do cliente) →
   **non-custodial**. Tenant **central** (`arena-tech`) → **custodial mantido** (precisa
   assinar o refill de L-BTC sem usuário). HSM/cosigner para o central fica como
   **evolução futura**.
2. **Taxa de depósito → sub-conta custodial dedicada.** Em vez de assinar do tenant comum
   sem usuário (impossível no non-custodial), a taxa de depósito é cobrada numa **carteira
   custodial separada, só para taxas**, isolada do saldo do cliente. Cobra na hora, como hoje.
3. **Sem cache de passphrase.** 2FA + passphrase a cada saque. Sem cache no browser nem no
   servidor — máxima segurança.
4. **KDF: Argon2id** (`argon2-cffi` no LWK Python). Perfil INTERACTIVE: `m=256 MiB`, `t=3`,
   `p=2`, `hashLen=32`. Escolhido por ser memory-hard (resistente a GPU/ASIC) e recomendado
   OWASP/PHC — o blob protege a chave de gastar dinheiro real, então o custo de brute-force
   offline precisa ser o maior viável. Parâmetros **versionados dentro do blob** (rotação).
5. **Cifragem: AES-256-GCM**, mesmo padrão de `src/lib/auth/two-factor.ts` (IV 12B, authTag
   16B). **Diferença crítica:** a chave deriva da **passphrase via Argon2id**, não do
   `NEXTAUTH_SECRET` — o servidor nunca tem a chave.
6. **Blob no Postgres** (`TenantDepixWallet.encryptedSeed`), não no volume LWK. O blob é
   inútil sem a passphrase, então o Postgres (RLS já existente, backup, auditoria) é o lugar
   certo, e tira o segredo do volume — que era o ponto único de comprometimento.
7. **LWK assina decifrando em memória.** O `/transfer` recebe `{encrypted_seed, passphrase}`,
   roda Argon2id+AES-GCM **em memória**, deriva `lwk.Signer`, assina o PSET e **descarta**
   sem persistir. O Node nunca vê o mnemônico em claro; a seed em claro existe só dentro do
   request handler do LWK.

## Modelo de confiança: o que o servidor vê e o que NÃO vê

| | Hoje (custodial) | **v1 (este ADR)** | v2 (futuro) |
|---|---|---|---|
| Seed no servidor? | Texto puro no volume | **Cifrada** (ilegível sem passphrase) | Nunca |
| Passphrase armazenada? | — | **Nunca** (nem hash) | Nunca |
| Passphrase passa pelo servidor? | — | Só no instante do saque, **descartada** | Nunca |
| Servidor consegue ver a seed? | Sim (problema atual) | **Não** (sem a passphrase) | Não |
| Superadmin revela seed alheia? | Sim | **Não** | Não |

**Decisão v1 agora, v2 depois.** A v2 (assinatura no navegador via `lwk_wasm`, a passphrase
nunca toca o servidor) é o non-custodial "puro", mas a Blockstream classifica `lwk_wasm`
como *proof of concept / experimental* — risco alto para custódia de dinheiro real como
primeiro passo. A v1 já entrega o essencial (seed cifrada; ninguém vê sem a passphrase;
superadmin não revela seed alheia) e é a **fundação reaproveitável** da v2 (blob, KDF,
backup de mnemônico, modelo de passphrase). O único resíduo da v1 — a passphrase atravessa
o servidor por um instante no saque — é eliminado só na v2.

## Recuperação de acesso

A passphrase **não** tem "esqueci minha senha": se tivesse, o servidor poderia refazer a
chave e voltaria a ser custodial. **Isso é por design.** Em troca, há **dois caminhos de
recuperação independentes** — basta **um**:

| O que o usuário tem | Recupera acesso? | Revela o mnemônico de novo? | Como |
|---|---|---|---|
| **A passphrase** (carteira no sistema) | ✅ | ✅ `reveal` com a passphrase mostra as 24 palavras | decifra o blob; pode trocar a passphrase (`rewrap`) |
| **O mnemônico (24 palavras)** | ✅ | ✅ já em mãos | `recover`: 24 palavras + **nova** passphrase |
| **Passphrase E mnemônico** | ✅ | ✅ | qualquer caminho |
| **Nada dos dois** | ❌ **perda total** | ❌ | inerente ao non-custodial — nem suporte, nem superadmin |

Texto que vai na UI (direto ao operador): "Com sua passphrase você vê suas 24 palavras
quando quiser"; "esqueceu a passphrase mas tem as 24 palavras? recupera com uma nova
passphrase"; "perdeu os dois? os fundos são inacessíveis para sempre, nem a Arena Tech
recupera". Por isso o **setup obriga** o backup das 24 palavras (mostradas uma vez, com
confirmação "digite a Nª palavra") — elas são a segunda chave.

## Formato do blob cifrado (versionado)

```json
{
  "v": 1,
  "kdf": "argon2id",
  "kdfParams": { "m": 262144, "t": 3, "p": 2 },
  "kdfSalt": "<base64 16B>",
  "cipher": "aes-256-gcm",
  "iv": "<base64 12B>",
  "authTag": "<base64 16B>",
  "ciphertext": "<base64 do mnemônico>",
  "createdAt": "...",
  "rewrappedAt": "..."
}
```

## Fluxo de saque non-custodial (com 2FA coexistindo)

O saque já exige **2FA TOTP** no Dialog de confirmação. Adicionar a **passphrase** ali, no
mesmo passo:

1. **UI:** campo `passphrase` (`type="password"`, `autoComplete="off"`, limpo no close) ao
   lado do `twoFactorCode`, **só quando** `custodyModel=non_custodial`. Ambos na mesma mutation.
2. **Backend `createWithdraw`:** mantém **2FA primeiro** (prova *identidade*); a passphrase
   prova *posse da chave* — camadas distintas, ambas exigidas. A passphrase entra **depois**
   de `checkDailyWithdrawCap`/reserva, logo antes do `transfer`, para não desperdiçar UX em
   saques que já falhariam. A taxa Arena Tech do saque segue no **mesmo PSET** (mesma
   passphrase). Nunca logar/persistir a passphrase (`sanitizeUserError` estendido).
3. **LWK `/transfer`:** decifra → assina → broadcast → descarta. Idempotência permanece, mas
   o store **nunca** guarda passphrase/plaintext.
4. **Auto-refill L-BTC pós-saque:** **inalterado** (central custodial).
5. **Passphrase errada:** LWK retorna `invalid_passphrase` → "Senha da carteira incorreta"
   (PT-BR); a transaction vai a `FAILED` sem debitar (só fica `PROCESSING` após `sweep.txid`).

## Plano de migração (zero-downtime, opt-in por tenant)

- **Fase 0 — Preparação.** Migration (schema) + endpoints LWK novos + TS condicionando por
  `custodyModel`. Default `custodial` ⇒ comportamento atual intacto; saque automático segue
  para quem não migrou.
- **Fase 1 — Migração assistida.** Banner na carteira; operador define passphrase → LWK lê o
  `mnemonic.txt` existente, cifra, devolve blob → TS grava `encryptedSeed` +
  `custodyModel=non_custodial`. UI **força anotar a seed**. Saques funcionam nos dois modos —
  ninguém trava.
- **Fase 2 — Purga das seeds em claro.** Após `non_custodial` confirmado + **carência (7
  dias)** + ≥ 1 saque non-custodial bem-sucedido, um job apaga `mnemonic.txt` daquele tenant.
  Ponto de não-retorno, auditado. A carência mitiga migração precipitada.
- **Fase 3 — Taxa de depósito + central.** Implementar a sub-conta custodial de taxas
  (decisão 2). Registrar HSM/cosigner do central como evolução futura. Independente; por último.

## Riscos e mitigações

- **Perda da passphrase = perda total:** backup obrigatório da seed no setup + tela de
  recuperação por 24 palavras; comunicação brutalmente clara na UI.
- **Passphrase em trânsito:** só HTTPS → tRPC → rede interna do compose (`X-API-Key`;
  idealmente rede Docker privada). Nunca em log/erro/idempotência.
- **Seed em memória do LWK:** existe só dentro do request handler; descartar após assinar;
  nunca gravar.
- **Migração precipitada:** carência + comprovação de saque antes da purga; default custodial.

## Alternativas consideradas

- **Assinatura 100% no cliente (LWK-WASM no browser) — v2:** non-custodial puro, mas
  reescreve o pipeline de sync/broadcast/idempotência do Python e não resolve os fluxos
  sem-usuário; `lwk_wasm` ainda é proof-of-concept. Evolução futura, reaproveitando blob/KDF.
- **Passphrase derivada da senha de login / do `NEXTAUTH_SECRET`:** rejeitada — o servidor
  poderia derivar a chave ⇒ volta a ser custodial de fato.
- **Diferir taxa de depósito no ledger (cobrar no próximo saque):** rejeitada em favor da
  sub-conta custodial (decisão do dono).
- **Tornar o tenant central também non-custodial:** rejeitada — travaria o auto-refill de
  L-BTC, malha que mantém todos os saques funcionando. HSM/cosigner é a evolução de longo prazo.

## Consequências

- Saque de tenant non-custodial exige passphrase a cada operação (muda o fluxo de balcão —
  treinar operadores antes da Fase 1).
- Ninguém (nem superadmin, nem suporte) recupera fundos de quem perde passphrase **e** seed.
- A base (blob, KDF, backup, recuperação) habilita tanto a feature de **criar/importar/trocar
  carteira** quanto a futura **v2** (assinatura no navegador), sem retrabalho.
