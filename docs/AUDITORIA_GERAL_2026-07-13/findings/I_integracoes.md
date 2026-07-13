# Auditoria de Integrações Externas — Arena Tech (pdvdepix)

**Data:** 2026-07-13
**Escopo:** Eulen (PIX→DePix), LWK (Liquid), Sideswap (DePix→USDT), Nuvem Fiscal (NF-e), WhatsApp Cloud + Evolution, Chatwoot, BrasilAPI (NCM/CNPJ/CEP), Cloudinary/MinIO, Resend, Autentique, InfinitePay.
**Método:** leitura de código (`src/lib/services`, `src/lib/integrations`, `src/lib/webhooks`, `src/server/services`), inspeção de webhook handlers, e leitura de logs de produção (`ssh contabo`, read-only). Nenhuma chamada real às APIs externas foi feita.

**Resumo executivo:** o núcleo de dinheiro (Eulen, LWK, Sideswap, InfinitePay) está **bem-endurecido** — timeout em toda chamada, idempotência real onde importa (nonce Eulen, Idempotency-Key LWK, order_nsu InfinitePay), fail-closed em prod, mensagens degradadas, e webhooks com assinatura verificada em tempo constante. Os achados de maior severidade são **operacionais/de contrato**, não de segurança: (1) a reconciliação de depósitos DePix por extrato está **quebrada em produção agora** (contrato do `GET /deposits` mudou), e (2) o **download de PDF/XML da NF-e aponta para uma rota que não existe** (404). Vários serviços auxiliares (Cloudinary, Tavily, media) têm gaps menores de timeout/contrato.

---

## Eulen (gateway PIX→DePix)

### I1 — Reconciliação de depósitos por extrato quebrada em produção (contrato do `GET /deposits` mudou) — **ALTA** — FATO
- **Onde:** `src/lib/services/depix-service.ts:820-827` (`listEulenDeposits`) + consumidor `src/server/services/depix-transaction.service.ts:2186-2190` + cron `src/app/api/cron/reconcile-eulen-extract/route.ts`.
- **Fato (logs de prod, 2026-07-13T04:07):** todo ciclo do cron emite `Depix extrato: resposta nao-array` e `reconcileEulenDepositsByExtract: extrato indisponivel` com `errors:2`. O código espera um **array cru** (`if (!Array.isArray(raw))` → trata como erro), mas a Eulen está devolvendo outro shape (provavelmente `{response: [...]}` ou paginado).
- **Impacto quando a API "falha":** não é que a API caiu — o **contrato mudou** e a nossa rede de segurança de conciliação por extrato ficou **cega**. Quando o webhook Eulen E o monitor LWK falharem juntos (foi exatamente esse o cenário do incidente do timeout Eulen/LWK), o extrato era o último recurso para creditar/estornar depósitos presos — e ele não funciona mais. Depósitos podem ficar presos em PENDING/PROCESSING sem reconciliação automática.
- **Fix:** inspecionar a resposta atual da Eulen (`GET /deposits`) e tornar o parsing tolerante: aceitar tanto array cru quanto `{response: [...]}` (reusar `parseEnvelope`), extrair o array de dentro do envelope antes do `.map`. Adicionar teste de contrato com ambos os shapes. Confiança: **alta** (evidência direta em log de prod, todo ciclo).

### I2 — `createPixPayment` async retorna erro em vez de retentar com o mesmo nonce — **BAIXA** — FATO
- **Onde:** `depix-service.ts:308-314`.
- **Fato:** se o deposit vier `async:true` (fila da Eulen), a função retorna `{success:false}` e delega o retry ao caller. O withdraw (`postWithdrawSync`, linhas 522-578) já faz o loop de retry com o mesmo nonce internamente; o deposit não.
- **Impacto:** raro (deposit síncrono por design). Se ocorrer, o usuário vê "API PIX ocupada; tente novamente" e precisa reagir. Sem risco de duplicação (nonce estável). Baixa severidade — comportamento aceitável, apenas menos gracioso.
- **Fix (opcional):** aplicar o mesmo loop de retry com backoff do withdraw ao deposit. Confiança: alta.

**Idempotência de dinheiro (Eulen):** SÓLIDA. Deposit e withdraw usam `X-Nonce: <id da transação local>` (estável por intenção). Withdraw força modo síncrono e retenta com o **mesmo** nonce — documentado como seguro pela Eulen. `getPixStatus`/`getDepixWithdrawStatus`/`listEulenDeposits` usam nonce novo (leitura). Todas as chamadas têm timeout (20-45s). CPF do pagador exigido antes de chamar (fail-fast). Fail-closed parcial: sem `DEPIX_API_KEY` cai em mock (aceitável, `isDepixConfigured()` distingue).

**Webhook Eulen:** `src/lib/webhooks/eulen-auth.ts` valida `Authorization` em **tempo constante** contra `EULEN_WEBHOOK_SECRET` (3 formatos aceitos), fail-closed se secret ausente. Replay-guard por IP/source. Já auditado anteriormente (S1/S2 revalidam via Eulen antes de settle).

---

## LWK (carteira Liquid)

### I3 — Sem achado de severidade — serviço bem-endurecido — INFO
- **Onde:** `src/lib/services/lwk-service.ts`.
- **Fato:** `lwkFetch` centraliza todas as chamadas com `AbortController` + timeout (default 30s, transfer 120s justificado por sync+broadcast). **Fail-closed real em prod**: `getConfig()` lança se `LWK_API_URL/KEY` ausentes (linha 65-69), `safeGetConfig` converte em erro sem 500 cru. Toda função pública trata erro e retorna `{success:false, error:"LWK indisponivel"}`. Auth por `X-API-Key`. Códigos de erro do LWK traduzidos para PT-BR (`insufficient_lbtc`, `insufficient_depix`, etc). Passphrase nunca logada (`signPset`, `transfer`).
- **Idempotência:** `transfer` (saque + taxa) usa `Idempotency-Key` → LWK devolve mesmo txid sem transferir 2×; retorna `idempotentReplay`. Crítico e correto.
- **Parsing:** defensivo (casts com `?? default`, sem Zod mas com narrowing manual). Aceitável dado que o LWK é serviço interno controlado pela própria Arena.

### I4 — Parsing das respostas do LWK sem validação de schema (casts manuais) — **BAIXA** — HIPÓTESE
- **Onde:** `lwk-service.ts` — vários `body.txid as string | undefined`, `Number(body.depix_balance ?? 0)`.
- **Hipótese:** se o LWK mudar um nome de campo (ex.: `fee_satoshis`), o serviço silenciosamente devolve `undefined`/`0` sem erro. Como o LWK é interno e versionado pela mesma equipe, o risco é baixo, mas um `signPset` retornando `signed_pset` ausente cairia em `signedPset: undefined` e o Sideswap falharia depois com mensagem confusa.
- **Fix (opcional):** Zod leve nas respostas de transfer/signPset/getBalance. Confiança: média.

---

## Sideswap (swap DePix→USDT, WebSocket)

### I5 — Swap não é idempotente e não persiste `quote_id`/`txid` intermediário — **MÉDIA** — HIPÓTESE
- **Onde:** `src/server/services/sideswap-swap.service.ts:104-211` (`executeSwap`).
- **Fato:** o swap é uma sequência WebSocket (start_quotes → get_quote → sign-pset → taker_sign) com timeout de 15s por etapa. Se o `taker_sign` (etapa 6, broadcast) responder mas a conexão cair **antes** de recebermos o `txid` (linha 188), a função retorna `{success:false}` — mas o swap **pode ter sido transmitido on-chain**. Não há idempotency-key nem persistência do `quote_id` para reconciliar depois.
- **Impacto:** um retry do usuário faria **um segundo swap** (vende DePix duas vezes). Diferente do saque Eulen/LWK (que têm nonce/idempotency-key), o Sideswap taker não tem proteção equivalente aqui. Perda financeira possível em cenário de timeout na última etapa.
- **Fix:** antes do `taker_sign`, persistir `quote_id`+`amount`+timestamp num registro local; num retry, checar se já há swap on-chain para aquele quote/UTXOs (o próprio `getUtxos` mostraria os DePix já gastos). No mínimo, exigir confirmação manual/idempotência de UI e alertar em vez de permitir re-execução cega. Confiança: **média** (depende de quão frequente é a falha na última etapa; a janela é pequena mas o custo é real). NOTA: memória do projeto indica que o swap é fase 2/experimental e ainda não está em uso pesado — verificar se está exposto na UI antes de priorizar.

### I6 — `JSON.parse(event.data)` sem try/catch dentro dos handlers de mensagem — **BAIXA** — FATO
- **Onde:** `sideswap-swap.service.ts:59` e `:79` (`onMessage`).
- **Fato:** `JSON.parse(String(event.data))` roda sem guarda. Uma mensagem malformada do servidor lançaria dentro do listener, escapando do `try/catch` externo (o listener é assíncrono ao fluxo principal) e poderia deixar a Promise pendurada até o timeout de 15s.
- **Impacto:** degradação para timeout genérico "falha no swap Sideswap" em vez de erro claro. Sem risco de dinheiro. Baixa.
- **Fix:** envolver o parse em try/catch; ignorar frames não-JSON. Confiança: alta.

---

## Nuvem Fiscal (NF-e)

### I7 — Download de PDF/XML da NF-e aponta para rota inexistente (404) — **ALTA** — FATO
- **Onde:** `src/lib/services/fiscal-service.ts:276-282` (`getInvoiceDocumentUrls`) devolve `/api/fiscal/download?ref=...&type=pdf|xml`. Consumido em `src/server/api/routers/fiscal.ts:496,514`.
- **Fato:** **não existe** rota `/api/fiscal/download` no projeto. Busca em `src/app/api` só encontra `webhooks/nuvemfiscal`. O comentário na linha 277 diz "the API route handles auth with Nuvem Fiscal", mas essa rota nunca foi criada.
- **Impacto:** o lojista emite a NF-e com sucesso, mas ao clicar em baixar DANFE (PDF) ou XML recebe **404**. Funcionalidade fiscal core parcialmente quebrada — não há como entregar o documento fiscal ao cliente pela aplicação.
- **Fix:** criar `src/app/api/fiscal/download/route.ts` que autentica (sessão + tenant), busca o `providerRef`, chama a Nuvem Fiscal (`GET /nfe/{ref}/pdf` e `/xml`) com o token OAuth e faz proxy do stream. Alternativamente, buscar as URLs diretas da Nuvem Fiscal na emissão e persistir. Confiança: **alta** (rota comprovadamente ausente). Verificar se há caminho alternativo de download que eu não vi — mas os dois consumidores no router apontam só para essa URL.

### I8 — `createAndAuthorizeInvoice` bloqueia a mutation por até ~90s (poll síncrono) — **MÉDIA** — FATO
- **Onde:** `fiscal-service.ts:288-322` (`pollProcessing`: 10 tentativas × 3s = 30s) + 60s de timeout por chamada, dentro da mutation `fiscal.ts:365` (`await createAndAuthorizeInvoice`).
- **Fato:** quando a SEFAZ devolve `processando`, o serviço faz polling síncrono bloqueante (até 30s de sleeps + I/O). O request tRPC do usuário fica pendurado o tempo todo. Sem fila/background job.
- **Impacto:** UX ruim (spinner longo, risco de timeout de proxy/gateway estourar antes) e ocupa um worker Node pelo período. Em pico de emissão, pode esgotar conexões. Não corrompe dado (idempotência da SEFAZ pela chave de acesso protege), mas é frágil.
- **Fix:** emitir de forma assíncrona — retornar `processando` imediatamente, persistir o `providerRef`, e um cron/webhook (`webhooks/nuvemfiscal` já existe e valida HMAC) atualiza o status. Confiança: alta.

### I9 — Token OAuth Nuvem Fiscal em cache module-level compartilhado entre tenants — **BAIXA** — FATO
- **Onde:** `fiscal-service.ts:54` (`let cachedToken`).
- **Fato:** o token client-credentials é global ao processo. Correto **se** as credenciais Nuvem Fiscal forem da Arena Tech (uma conta, multi-empresa via CNPJ no payload). Se algum dia forem por-tenant, o cache vazaria token entre tenants.
- **Impacto:** hoje nenhum (arquitetura single-account). Registrar como armadilha futura. Confiança: alta.

**Webhook Nuvem Fiscal:** valida HMAC-SHA256 (`X-Webhook-Signature`) contra `NUVEM_FISCAL_WEBHOOK_SECRET` com `safeEqual` — OK.
**Fail-closed:** `getConfig()` lança em prod se credenciais ausentes (evita NF-e falsa) — bom.

---

## WhatsApp (Cloud API + Evolution)

### I10 — Sem retry em envio de mensagem (falha transitória = mensagem perdida) — **BAIXA** — FATO
- **Onde:** `whatsapp-cloud-service.ts:77-121` (`sendCloudText`), `:127-177` (`sendCloudTemplate`), `whatsapp-service.ts` (Evolution).
- **Fato:** timeout OK (15s Cloud, 15-30s Evolution). Erro tratado e retornado `{success:false}`. Mas não há retry nem fila — um 500/timeout transitório da Meta descarta a notificação (ex.: lembrete de OS, aviso de lead).
- **Impacto:** perda silenciosa de notificação outbound. Envio é fire-and-forget na maioria dos call-sites. Baixa (mensagens não são dinheiro), mas afeta confiabilidade de comunicação com cliente.
- **Fix:** para mensagens importantes, enfileirar com retry/backoff (BullMQ/Redis) ou ao menos registrar falha para reenvio manual. Confiança: alta.

### I11 — Resposta da Meta parseada sem Zod (contrato assumido) — **BAIXA** — HIPÓTESE
- **Onde:** `whatsapp-cloud-service.ts:104` (`json.messages?.[0]?.id`).
- **Fato:** parsing por optional chaining; se a Meta mudar o shape de erro, `error` pode virar `undefined` e um envio falho ser reportado como sucesso (`success:true` com `messageId:undefined`). Baixa probabilidade (Graph API é estável e versionada por `v22.0`). Confiança: baixa.

**Fail-closed:** ambos os serviços lançam/mockам em prod só com flag explícita (`WHATSAPP_MOCK=1`) — bom (evita descarte silencioso). Números normalizados. Janela de 24h respeitada via template fallback (memória do projeto confirma).

---

## Chatwoot (atendimento)

### I12 — Sem achado relevante — INFO
- **Onde:** `src/lib/talison/chatwoot-client.ts`.
- **Fato:** timeout 15s (`AbortSignal.timeout`), auth por `api_access_token`, erro tratado retornando `false` (best-effort, correto para canal de saída de bot). Mock sem credenciais. Sem retry, mas é aceitável (histórico fica no Chatwoot; falha de post é log-and-continue).
- **Webhook Chatwoot inbound** (`app/api/webhooks/chatwoot/route.ts`): valida token via header `authorization`/`x-chatwoot-signature` OU query `?token=` (redigido no nginx, ADR 0048) com compare timing-safe. Aceitável dado que o Chatwoot Agent Bot não permite header custom.

---

## BrasilAPI (NCM / CNPJ / CEP-ViaCEP)

### I13 — Sem achado relevante — INFO
- **Onde:** `src/lib/integrations/brasilapi-ncm.ts`, `brasilapi-cnpj.ts`, `viacep.ts`.
- **Fato:** timeout 5s (`AbortController`+`setTimeout`) em todas. **Degradação graciosa exemplar**: NCM cai no mapa curado local se a API falhar; CNPJ/CEP retornam `null` e o chamador segue. Nenhuma dessas chamadas é crítica/dinheiro. Read-only, retry desnecessário. Contrato tolerante (`data.x as string || default`).

---

## Cloudinary / MinIO (imagens)

### I14 — Uploads/deletes Cloudinary sem timeout explícito — **MÉDIA** — FATO
- **Onde:** `src/lib/product-image-service.ts:239-268` (`uploadBufferToCloudinary` via `upload_stream`), `:102` (`cloudinary.uploader.destroy`).
- **Fato:** ao contrário de todas as chamadas `fetch` do projeto (que têm `AbortSignal.timeout`), o SDK do Cloudinary é usado sem `timeout` configurado. O `upload_stream` retorna uma Promise que só resolve no callback — se o Cloudinary pendurar, **não há teto**. O upload roda dentro de uma mutation tRPC (upload de foto de produto), então um Cloudinary lento pendura o request indefinidamente.
- **Impacto:** hang de request + worker Node ocupado enquanto o Cloudinary não responde. Sem corrupção de dado. Média (é caminho de UI, não de dinheiro, mas o padrão de timeout do resto do código não foi seguido aqui).
- **Fix:** passar `{ timeout: 30000 }` no `cloudinary.config()` (o SDK aceita), ou envolver o `upload_stream` num `Promise.race` com timeout. Confiança: alta.

### I15 — S3/MinIO cria um `S3Client` novo por operação; credenciais default `minioadmin` em dev — **BAIXA** — FATO
- **Onde:** `product-image-service.ts:411,450` (novo `S3Client` a cada upload/delete), `:405-406` (`|| "minioadmin"`).
- **Fato:** o SDK AWS não tem timeout de socket configurado (usa default do SDK, que é generoso). Cliente recriado por chamada (minor overhead). Credenciais default `minioadmin` só em dev (prod lança se ausentes, linha 402) — OK.
- **Impacto:** baixo. Recomendável configurar `requestHandler` com timeout e reusar o cliente. Confiança: alta.

---

## Resend (email)

### I16 — Sem retry; resposta parseada sem Zod — **BAIXA** — FATO
- **Onde:** `src/lib/services/email-service.ts:55-96`.
- **Fato:** timeout 15s, fail-closed em prod (sem `RESEND_API_KEY` → recusa e loga error, ex.: reset de senha), erro tratado. Sem retry — falha transitória perde o email. Parsing `data["id"]` sem validação. Reset de senha / verificação são sensíveis: um Resend com hiccup deixa o usuário sem o email e sem sinal claro.
- **Impacto:** baixo-médio para fluxos de auth (reset/verificação). Fix: retry curto com backoff para emails transacionais críticos. Confiança: alta.

---

## Autentique (assinatura digital)

### I17 — Sem achado relevante — INFO
- **Onde:** `src/lib/services/autentique-service.ts`.
- **Fato:** timeout 15-45s em todas as chamadas GraphQL (linhas 212/319/418), fail-closed em prod (lança sem `AUTENTIQUE_API_KEY`, exceto `AUTENTIQUE_MOCK=1` para E2E), erros traduzidos para PT-BR (`translateAutentiqueError`), incluindo `rate_limit_exceeded`. Webhook Autentique existe (`app/api/webhooks/autentique`).

---

## InfinitePay (checkout hospedado)

### I18 — Sem achado relevante — INFO
- **Onde:** `src/lib/services/infinitepay-service.ts`.
- **Fato:** timeout via `AbortController` (`REQUEST_TIMEOUT_MS`), erro tratado (HTTP e não-JSON), timeout vira mensagem clara. **Idempotência natural**: cria um *link* de checkout hospedado com `order_nsu` (order-scoped) — não é uma cobrança direta, então retry recria/reusa o link sem duplicar cobrança. Confirmação via `payment_check` (leitura). Webhook InfinitePay existe (`app/api/webhooks/infinitepay`). Memória do projeto: OTP/prefill do checkout é inerente ao provedor, decisão do dono de deixar como está.

---

## Tabela-resumo por integração

| Integração | Timeout? | Retry seguro? | Error handling / degradação? | Idempotência (dinheiro)? |
|---|---|---|---|---|
| **Eulen deposit** | Sim (45s) | Nonce estável; async→erro (não retenta) [I2] | Sim, mensagens claras | **Sim** (X-Nonce = id local) |
| **Eulen withdraw** | Sim (45s) | **Sim** (loop mesmo nonce, síncrono) | Sim | **Sim** (X-Nonce) |
| **Eulen status/extrato** | Sim (20-30s) | N/A (leitura) | **Extrato QUEBRADO em prod [I1]** | N/A |
| **LWK** | Sim (30-120s) | **Sim** (Idempotency-Key) | Sim, fail-closed prod, PT-BR | **Sim** (Idempotency-Key) |
| **Sideswap** | Sim (15s/etapa) | **NÃO** [I5]; parse sem guarda [I6] | Sim (retorna erro) | **NÃO** [I5] |
| **Nuvem Fiscal** | Sim (30-60s) | Chave de acesso (SEFAZ) | Sim, fail-closed prod; **download 404 [I7]**; poll bloqueante [I8] | Parcial (chave de acesso) |
| **WhatsApp Cloud** | Sim (15s) | **Não** [I10] | Sim, fail-closed prod | N/A |
| **WhatsApp Evolution** | Sim (15-30s) | **Não** [I10] | Sim | N/A |
| **Chatwoot** | Sim (15s) | Não (best-effort) | Sim (log-and-continue) | N/A |
| **BrasilAPI (NCM/CNPJ/CEP)** | Sim (5s) | N/A (leitura) | **Excelente** (fallback local/null) | N/A |
| **Cloudinary** | **NÃO [I14]** | Não | Sim (best-effort no delete) | N/A |
| **MinIO/S3** | Default SDK [I15] | Não | Sim (prod lança) | N/A |
| **Resend** | Sim (15s) | **Não** [I16] | Sim, fail-closed prod | N/A |
| **Autentique** | Sim (15-45s) | Não | Sim, fail-closed prod, PT-BR | N/A |
| **InfinitePay** | Sim | Seguro (link + order_nsu) | Sim | **Sim** (order_nsu, link hospedado) |

**Webhooks inbound (assinatura):** Eulen (Basic timing-safe), Nuvem Fiscal (HMAC-SHA256), LWK-deposit (HMAC-SHA256, fail-closed), Evolution (Bearer timing-safe), Chatwoot (token timing-safe, header/query). Todos verificam assinatura/token — **nenhum gap de auth encontrado**.

---
## ADENDO (pós-auditoria, verificado por mim)

### I7 CONFIRMADO E AINDA ABERTO — download NF-e retorna 404
`fiscal-service.ts:279-280` (`getInvoiceDocumentUrls`) retorna URLs para
`/api/fiscal/download?ref=...&type=pdf|xml`, mas **essa rota NÃO EXISTE** em
`src/app/api/` (só existe `/api/webhooks/nuvemfiscal`). O comentário diz "the API
route handles auth" — a rota nunca foi criada.
O PR #542 (que abri nesta auditoria) ligou os BOTÕES "Baixar PDF/XML" no
invoice-detail, mas eles chamam `downloadPdf`→essas URLs falsas→**404**. Logo o
#542 melhora a UX (botão existe) mas o download ainda quebra até criar a rota.
**Fix pendente:** criar `app/api/fiscal/download/route.ts` que autentica o tenant,
resolve a invoice por providerRef, busca o PDF/XML real na Nuvem Fiscal
(`/nfe/{ref}/pdf` e `/nfe/{ref}/xml` via apiFetch com OAuth) e faz stream de volta.
Requer exportar um `fetchInvoiceDocument` de fiscal-service. NÃO é dinheiro (é
documento) mas toca fiscal — implementável com CI verde.

### I1 — reconciliação DePix por extrato quebrada em prod (contrato Eulen mudou)
Confirmar nos logs de prod e ajustar o parsing de `GET /deposits`. É rede de
segurança de conciliação (cron reconcile-eulen-extract), não o fluxo principal
(que usa webhook). Prioridade: alta (rede de segurança cega), mas não bloqueia
operação. Documentado para o dono / próxima rodada.
