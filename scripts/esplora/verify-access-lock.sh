#!/usr/bin/env bash
# Valida o fechamento de esplora.pdvdepix.app por IP de origem.
#
# Rode DEPOIS de criar a WAF rule. O que se espera:
#   - de fora (esta maquina): 403  -> a Esplora deixou de ser publica
#   - da VPS (194.34.232.81): 200  -> o LWK continua enxergando a rede
#
# O 2o teste e o que importa: se a VPS tomar 403, o full_scan para, o saldo
# congela e os saques travam. Nesse caso, DESATIVE a regra na hora.
#
# Use /blocks/tip/hash: o servidor e o waterfalls, que NAO implementa
# /blocks/tip/height (da 404 mesmo funcionando — nao confunda com bloqueio).
set -uo pipefail

HOST="https://esplora.pdvdepix.app"
PATH_OK="/blocks/tip/hash"

code_de_fora=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$HOST$PATH_OK")
code_da_vps=$(ssh contabo "curl -s -o /dev/null -w '%{http_code}' --max-time 20 '$HOST$PATH_OK'" 2>/dev/null)

echo "de fora (internet publica): HTTP $code_de_fora   (esperado 403)"
echo "da VPS  (194.34.232.81):    HTTP $code_da_vps   (esperado 200)"
echo

falhou=0
[ "$code_de_fora" = "403" ] || { echo "AINDA PUBLICA: de fora deu $code_de_fora, nao 403."; falhou=1; }
[ "$code_da_vps" = "200" ]  || { echo "PERIGO: a VPS tomou $code_da_vps. O LWK perdeu a Esplora — DESATIVE a regra."; falhou=1; }

# Prova de ponta a ponta: nao basta o HTTP responder, o LWK precisa LER a rede
# pela lib (que fala waterfalls, nao curl).
tip=$(ssh contabo 'docker exec arenatech-lwk-wallet python3 -c "
import lwk
print(lwk.EsploraClient(\"https://esplora.pdvdepix.app\", lwk.Network.mainnet()).tip().height())
" 2>/dev/null' 2>/dev/null | tr -d "[:space:]")

if [ -n "$tip" ] && [ "$tip" -gt 0 ] 2>/dev/null; then
  echo "LWK lendo a rede pela Esplora propria: bloco $tip  OK"
else
  echo "LWK NAO consegue ler a Esplora propria — DESATIVE a regra."
  falhou=1
fi

[ "$falhou" = "0" ] && echo && echo "Esplora fechada, LWK intacto."
exit "$falhou"
