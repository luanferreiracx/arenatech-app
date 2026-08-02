#!/usr/bin/env bash
# Watchdog do waterfalls: detecta indexação travada e reinicia.
#
# POR QUE EXISTE (2026-07-29): durante o IBD o waterfalls congelou com o tip
# parado no MESMO bloco por 2,5h — sem erro, sem panic, sem log. Pior: ele parou
# de escrever log por completo (última linha às 09:28) enquanto seguia respondendo
# HTTP normalmente. Um `docker restart` destravou na hora.
#
# Consequência de projeto: NÃO dá para vigiar isso pelo log. A única evidência
# confiável é o tip AVANÇAR. É o que este script mede.
#
# Critério de reinício (os três juntos, para não reiniciar à toa):
#   1. o waterfalls está atrás do elements além da folga normal de indexação;
#   2. o tip dele não mudou desde a checagem anterior;
#   3. o elements está saudável (senão o problema é do nó, e reiniciar não ajuda).
set -uo pipefail

STATE=/var/lib/waterfalls-watchdog.state
LOG=/var/log/waterfalls-watchdog.log
ELEMENTS_CLI=(docker exec elements elements-cli -datadir=/data -conf=/etc/elements/elements.conf)
# Folga: o waterfalls indexa mais devagar que o nó baixa, então ficar atrás é
# NORMAL durante o IBD. Só é sintoma quando está atrás E parado.
LAG_MIN=50
# Tempo mínimo com o MESMO tip para considerar travado. Acima do intervalo do
# timer (10min) de propósito: exige duas leituras realmente espaçadas.
MIN_STALL_SECS=540

# Modo manutenção: enquanto este arquivo existir, o watchdog não age.
# Sem isto ele "conserta" um container parado de propósito — foi o que aconteceu
# no desligamento de 2026-07-30, quando ele subiu o waterfalls de volta no meio
# de uma parada limpa. Parada intencional não é falha.
[ -f /opt/waterfalls/MAINTENANCE ] && exit 0

ts() { date -u "+%Y-%m-%dT%H:%M:%SZ"; }
say() { echo "$(ts) $*" >> "$LOG"; }

tip_hash=$(curl -s -m 10 http://localhost:3100/blocks/tip/hash 2>/dev/null)
if [ -z "$tip_hash" ]; then
  say "waterfalls nao respondeu /blocks/tip/hash — reiniciando"
  docker restart waterfalls >/dev/null 2>&1
  exit 0
fi

elements_h=$("${ELEMENTS_CLI[@]}" getblockcount 2>/dev/null | tr -dc '0-9')
[ -z "$elements_h" ] && { say "elements nao respondeu — nada a fazer (problema e do no)"; exit 0; }

wf_h=$("${ELEMENTS_CLI[@]}" getblockheader "$tip_hash" 2>/dev/null | grep -oE '"height"[: ]+[0-9]+' | grep -oE '[0-9]+$')
[ -z "$wf_h" ] && wf_h=0

now=$(date -u +%s)
prev_hash=$(awk '{print $1}' "$STATE" 2>/dev/null || echo "")
prev_ts=$(awk '{print $2+0}' "$STATE" 2>/dev/null || echo 0)

lag=$(( elements_h - wf_h ))
if [ "$lag" -le "$LAG_MIN" ]; then
  echo "$tip_hash $now" > "$STATE"
  exit 0   # acompanhando o nó
fi
if [ "$tip_hash" != "$prev_hash" ]; then
  echo "$tip_hash $now" > "$STATE"
  exit 0   # atrás, mas avançando — é só o IBD
fi
# Tip igual ao da leitura anterior. Só é "travado" se tempo suficiente passou:
# duas execuções coladas (timer recém-ligado, run manual) veem o mesmo bloco por
# construção, e reiniciar um indexador saudável atrasa o que queríamos acelerar.
if [ $(( now - prev_ts )) -lt "$MIN_STALL_SECS" ]; then
  exit 0
fi
echo "$tip_hash $now" > "$STATE"

say "TRAVADO: tip $wf_h parado em $tip_hash (elements $elements_h, lag $lag) — reiniciando"
docker restart waterfalls >/dev/null 2>&1
say "reiniciado"
