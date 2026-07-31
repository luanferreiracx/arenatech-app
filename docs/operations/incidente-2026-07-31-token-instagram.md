# Incidente 2026-07-31 — atendimento pelo Instagram parou de responder

**Duração:** 07h18 → 10h14 (BRT), ~3 horas.
**Impacto:** 50 tentativas de resposta de atendentes falharam. Mensagens de
clientes continuaram **entrando** normalmente; só a **saída** quebrou.

## O que aconteceu

O token de acesso do Instagram (`IG_ACCESS_TOKEN`, do Laravel) **expirou às
00h00 PDT** (04h00 BRT). A Meta passou a recusar todo envio:

```
"Error validating access token: Session has expired on Friday, 31-Jul-26 00:00:05 PDT"
OAuthException, code 190
```

O caminho é `Chatwoot → webhook no Laravel (intranet.arenatechpi.com.br) → API do
Instagram`. O Laravel recebia 401 da Meta e devolvia **500** ao Chatwoot, que
marcava a mensagem como falha. Do lado do atendente, parecia que o Instagram
inteiro tinha caído.

Medido no nginx: **30/jul teve 227 requisições e zero falhas; 31/jul teve 25
respostas 500** — a quebra começou às 07h18, na primeira tentativa de envio
depois da expiração.

## Causa raiz

O comando `instagram:refresh-token` **já existia** e seu próprio comentário
prescrevia a solução: *"Token IGAA dura 60 dias e pode ser refreshed a qualquer
momento após 24h da emissão. Rodando a cada 7 dias garante que nunca expira."*

**Ele nunca foi agendado.** Confirmado nas três pontas:

1. `app/Console/Kernel.php` não tem **nenhuma** tarefa registrada;
2. o cron do `schedule:run` está comentado, com o marcador `#DESLIGADO_TALISON`
   — provavelmente desligado quando o bot migrou para o sistema novo;
3. não havia timer systemd para isso.

O token foi gravado em 3 de junho, durou os 60 dias da Meta e venceu.

É o mesmo padrão que a auditoria de finalização encontrou sete vezes, agora em
operação: **um controle que existe, parece proteção, e não está ligado a nada.**

## Por que o conserto não foi só "renovar"

Um token **já expirado não pode ser renovado** — testei contra a Meta e ela
recusa o próprio pedido de refresh (`ig_refresh_token` exige token válido). Foi
preciso **gerar um token novo** pelo Instagram Business Login, no App Dashboard
(`developers.facebook.com/apps` → Instagram → API setup with Instagram login).
Não sai do Business Manager.

Segunda armadilha: trocar o `.env` e rodar `config:cache` **não basta** — o
PHP-FPM mantém a config em memória. Sem `systemctl reload php8.3-fpm`, os
workers seguem com o token velho e o conserto parece não ter funcionado.

## Prevenção instalada

`arenatech-instagram-refresh-token.timer` — toda segunda, 04h30, com jitter.
Renovação a cada 7 dias dá **8 tentativas de folga** antes de qualquer
vencimento, então uma falha isolada de rede não derruba o atendimento.

O script (`/usr/local/bin/arenatech-instagram-refresh-token.sh`) faz os três
passos que a correção manual exigiu: renova, regrava o cache de config e
**recarrega o PHP-FPM**.

**Executado uma vez à mão antes de confiar nele** — a lição do próprio incidente
é que mecanismo nunca exercitado não conta:

```
Token Instagram renovado. Novo token válido por ~60 dias.
INFO  Configuration cached successfully.
```

`OnFailure` liga um unit que escreve no syslog com o marcador estável
**`ALERTA-IG-TOKEN`**, testado. Sem ele, uma falha da renovação ficaria invisível
até o token vencer — que foi exatamente como este incidente chegou ao atendente
antes de chegar a quem podia consertar.

## Pendente — decisão do dono

O `ALERTA-IG-TOKEN` hoje só vai para o syslog da VPS. **Falta ligá-lo a um canal
que alguém olhe** (e-mail, WhatsApp, Sentry). Enquanto isso não existir, a
detecção continua dependendo de alguém reparar na linha do log.

Vale também conferir **de quem é a conta** que emitiu o token: se for pessoal de
alguém que pode sair da empresa, o próximo vencimento vira o mesmo problema com
uma pessoa a menos para resolver.
