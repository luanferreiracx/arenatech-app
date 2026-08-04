# ADR 0068 — WhatsApp Cloud API por tenant (BYO)

- **Status:** Aceito
- **Data:** 2026-08-04
- **Contexto:** [ADR 0055](0055-talison-bot-config-editavel.md) (instruções do bot por tenant), [ADR 0050](0050-tenant-no-kyc-onboarding.md) (onboarding NO-KYC)

## Contexto

O bot Talison e as notificações de OS/venda já eram por tenant — instruções,
conversas, mensagens, tudo isolado. O que **não** era: as credenciais de saída.
`WHATSAPP_CLOUD_TOKEN` e `WHATSAPP_CLOUD_PHONE_NUMBER_ID` viviam em variáveis de
ambiente, uma conta única para todo mundo. Toda mensagem de toda loja saía do
mesmo número da Arena Tech.

Para vender o chatbot por tenant, cada loja precisa do próprio WhatsApp. O dono
escolheu **BYO (Bring Your Own)**: o lojista traz a conta dele da Meta. As
alternativas — Evolution por QR code (não-oficial, risco de ban) e Embedded
Signup (exige a Arena Tech aprovada como Tech Provider, semanas de processo) —
foram avaliadas e descartadas.

## Decisão

**1. Credencial por tenant em `TenantIntegration`, provider `WHATSAPP_CLOUD`.**
Reuso, não tabela nova: a tabela já existia com a forma exata — `(tenantId,
provider)` único, `enabled`, `config` JSON, RLS — e em uso em produção. Distinto
de `EVOLUTION_WHATSAPP`: são caminhos com contratos e riscos diferentes, e um
tenant pode usar um sem o outro.

**2. Token cifrado com `secret-box`**, mesmo padrão do 2FA e da carteira LWK, em
contexto próprio. O `phoneNumberId` fica legível de propósito: é identificador
público e permite diagnosticar (e mostrar na tela) sem decifrar nada.

**3. Verificar contra a Meta ANTES de gravar.**
`GET /{phone-number-id}` prova de uma vez que o token vale e que ele tem
permissão sobre aquele número. Salvar uma credencial que não funciona deixa o
lojista achando que configurou, e o defeito só aparece quando um cliente dele
não recebe resposta.

Dois achados da documentação que mudaram o desenho:
- a resposta traz `verified_name` e `display_phone_number` — então a tela mostra
  **qual** número foi conectado. "Conectado" sozinho não diz se é o número certo,
  e conectar o errado é o erro mais provável de quem administra mais de uma conta;
- existe um caso em que a Meta responde **HTTP 200** com credencial inutilizável
  (`code_verification_status != VERIFIED`). Aceitar salvaria uma configuração que
  nunca entrega mensagem.

**4. Verificação periódica diária** (`check-whatsapp-credentials`, 04:15).
Credencial de terceiro apodrece sozinha: o token expira (24h no temporário, 60
dias no de usuário; só o de system user é permanente), pode ser revogado no
Business Manager por outra pessoa, e o número pode perder a verificação. **Nada
disso gera evento nosso** — sem o cron, o primeiro sinal é o bot parar de
responder, e quem descobre é o cliente da loja.

A regra difícil não é checar, é **avisar**, e este projeto já errou isso (alarme
com limiar menor que o próprio ciclo, que disparava sempre até virar ruído). A
política mora em módulo puro:
- avisa **uma vez** por problema — repetir treina o dono a ignorar;
- avisa **de novo** quando o motivo muda (outro problema, outra ação);
- avisa a **recuperação**, mas só para quem soube da quebra;
- **rede fora não é credencial quebrada**: não grava veredito nem avisa, porque
  culpar a credencial de um problema nosso faria trocar um token correto.

**5. Envio por tenant com FALLBACK para o ambiente — não substituição.**
Tenant sem credencial própria continua enviando pela conta da Arena Tech. Trocar
de uma vez desligaria o WhatsApp de todo mundo que ainda não configurou.

O `tenantId` vem de `opts.log.tenantId`, que os chamadores já passavam para
auditoria — nenhum deles mudou. **Toda a cadeia de fallback de template recebe o
`tenantId`**: sem isso, o template primário falharia e o fallback sairia da conta
**errada** — defeito silencioso, porque a mensagem chega e ninguém vê erro.

**6. Templates sincronizados da WABA do tenant.**
`APPROVED_TEMPLATES` (catálogo do código) descreve a conta da Arena Tech. Fora da
janela de 24h a Meta só aceita template aprovado **na conta de quem envia** —
sem sincronizar, o sintoma seria: dentro de 24h funciona, fora dela toda mensagem
falha.

A lista **não substitui** o catálogo. Os metadados que o código usa para montar
os componentes (`params`, `hasDocumentHeader`, `isOtp`) não vêm da Meta — são
conhecimento nosso sobre *como* cada template é usado. A sincronização responde
uma pergunta só: "este tenant tem este template aprovado?".

Três estados, deliberadamente distintos:

| estado | significado | comportamento |
|---|---|---|
| `null` | nunca sincronizado | **pode tentar** — "não sabemos" ≠ "não tem" |
| `[]` | sincronizado, nada aprovado | bloqueia — a Meta já respondeu |
| `[...]` | sincronizado | só o que está na lista |

`null` permitir a tentativa é deliberado: barrar por falta de informação
desligaria o WhatsApp de quem acabou de conectar, defeito pior que o que se quer
evitar. A Meta é a autoridade final, e a recusa dela já é tratada.

## Consequências

**Boas**
- Cada loja pode enviar pelo próprio número, com o próprio nome verificado.
- A quebra de credencial é detectada **antes** do cliente da loja perceber.
- O caminho atual (conta única no ambiente) segue funcionando sem mudança.

**Custos e riscos**
- **Barreira de entrada alta**: BYO exige que o lojista chegue com WABA
  verificada e número registrado. Quem não tem precisa passar pelo processo da
  Meta sozinho. Se esse público for grande, o Evolution por QR code volta à mesa.
- O tenant precisa aprovar os **próprios templates** na Meta. Dentro da janela de
  24h isso não aparece; fora dela, sim.
- Uma consulta a mais por envio quando o tenant tem credencial própria (leitura
  da integração). Mitigado por ser leitura simples por chave única.

**Achado de segurança corrigido no caminho**
`settings.listIntegrations` é `tenantProcedure` e o **PDV o consome no diálogo de
pagamento** — todo operador de caixa recebia o `config` cru das integrações.
Havia só dados inócuos lá (`handle` do InfinitePay), mas a credencial do WhatsApp
passaria a morar no mesmo campo. Corrigido com allowlist explícito por provider:
campo novo não vaza por omissão, e provider desconhecido devolve `{}`.

## Alternativas descartadas

- **Evolution por tenant (QR code).** Sem Business Manager, sem aprovação, sem
  template — funciona em minutos. Descartado por ser não-oficial (risco de ban da
  conta do cliente). Continua sendo a saída se a barreira do BYO se mostrar alta
  demais.
- **Embedded Signup (Tech Provider).** Melhor experiência possível — o cliente
  autoriza num popup e o sistema emite o token. Exige a Arena Tech aprovada como
  Tech Provider pela Meta: semanas de processo antes de qualquer código.
- **Tabela nova para credenciais.** `TenantIntegration` já tinha a forma exata.
- **Substituir o catálogo pela lista sincronizada.** Perderia os metadados de
  montagem dos componentes, que a Meta não devolve.

## Pendente

- **Chatwoot por tenant**: o mapa `account_id → tenantId` segue em env var. O
  dono decidiu criar as accounts à mão; mover o mapa para o banco é trabalho
  separado, adiado por decisão dele.
- **Gate comercial**: sem cobrança separada por ora (decisão do dono) — quem tem
  o módulo `customers` no plano pode configurar, e todo plano do catálogo o
  inclui.

## Verificação

- 34 testes novos: verificação da credencial (6), config cifrada (3), política de
  aviso (4), serviço de verificação (6), roteamento por tenant (6), allowlist do
  `config` (4), sincronização de templates (9).
- Verificado que falham quando a funcionalidade é desligada: roteamento por
  tenant, regra do "não repetir aviso", e a linha que liga o gate DePix.
- **Navegador real**: a Meta recusou um token inventado e a tela mostrou *"O token
  não foi aceito pela Meta… gere um token permanente novo"* em português. 320px e
  200% de zoom sem reflow, 3 inputs com rótulo associado, 0 erros de console, e o
  token digitado não aparece no HTML servido.
- Timer systemd criado e testado na VPS (404 antes do deploy, que é o esperado —
  confirma que chama a URL certa).
