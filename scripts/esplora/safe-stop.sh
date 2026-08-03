#!/usr/bin/env bash
# Parada SEGURA da Esplora — rode SEMPRE antes de desligar/reiniciar o PC.
#
#   wsl.exe -d Ubuntu -u root -- bash /opt/waterfalls/safe-stop.sh
#
# POR QUE EXISTE (2026-07-30): desligar sem isto custa TODO o progresso de
# validação. O elementsd mantém o conjunto de UTXOs em RAM (o `dbcache`) e só o
# materializa em disco no shutdown; morrer antes disso deixa o `chainstate`
# vazio e o nó recomeça do bloco zero — perdemos ~12h duas vezes assim.
#
# A primeira tentativa de parada limpa TAMBÉM falhou, e a lição foi outra: o
# flush precisa de MAIS memória que o regime normal (ele materializa centenas de
# MB de UTXOs). Com o `mem_limit` ajustado no fio, o cgroup matou o processo
# justamente enquanto ele salvava (`oomkilled=true`, exit 137). Por isso o
# compose agora reserva folga de flush — e por isso este script CONFERE se o
# chainstate realmente cresceu, em vez de confiar no código de saída.
set -uo pipefail

STACK=/opt/waterfalls
DATA=/var/lib/docker/volumes/waterfalls_elements_data/_data/liquidv1

echo "== 1/4 modo manutenção (impede o watchdog de religar) =="
touch "$STACK/MAINTENANCE"

echo "== 2/4 parando waterfalls =="
docker stop -t 60 waterfalls >/dev/null 2>&1 && echo "   ok"

echo "== 3/4 parando elements (flush do chainstate — pode levar minutos) =="
before=$(du -sm "$DATA/chainstate" 2>/dev/null | cut -f1)
docker stop -t 900 elements >/dev/null 2>&1
code=$(docker inspect elements --format '{{.State.ExitCode}}' 2>/dev/null)
oom=$(docker inspect elements --format '{{.State.OOMKilled}}' 2>/dev/null)
after=$(du -sm "$DATA/chainstate" 2>/dev/null | cut -f1)

echo "== 4/4 verificação =="
echo "   exit=$code oomkilled=$oom chainstate=${before}MB -> ${after}MB"
if [ "$oom" = "true" ]; then
  echo "   FALHOU: o cgroup matou o nó durante o flush. Suba o mem_limit do"
  echo "   elements (ou baixe o dbcache) — do jeito que está, todo desligamento"
  echo "   custa o progresso inteiro."
  exit 1
fi
# O chainstate de um nó sincronizado é da ordem de centenas de MB. Continuar
# minúsculo significa que o flush não aconteceu, mesmo com exit 0.
if [ "${after:-0}" -lt 50 ]; then
  echo "   ATENÇÃO: chainstate segue pequeno (${after}MB) — o flush provavelmente"
  echo "   não completou. Ao religar, espere revalidação desde o início."
  exit 1
fi
echo "   OK — pode desligar o PC com segurança."
