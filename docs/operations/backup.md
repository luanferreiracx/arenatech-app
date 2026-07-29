# Backup do banco de produção

> Instalado em 2026-07-29. **Até essa data produção não tinha backup nenhum.**
> O [RUNBOOK](../RUNBOOK.md) documentava um `pg_dump` noturno em cron que nunca
> foi instalado: nem cron do root, nem do `deployer`, nem unit systemd, nem um
> único dump em disco. É a mesma classe do timer de `purge-webhook-events`
> (achado de 27/07): **doc de operação não se verifica sozinho.**

## Como funciona

Duas metades. Uma sozinha não resolve.

| Metade | O que protege | Onde vive |
|---|---|---|
| **Dump na VPS** (`arenatech-backup-db.timer`, 02:30 BRT) | Perda de **dados** (delete errado, migration ruim, corrupção lógica) | `/home/deployer/backups/db/` |
| **Pull de fora** (cron no PC com WSL2) | Perda do **servidor** (VPS morta, comprometida, cancelada) | Máquina do dono |

O modelo é **pull**, não push: quem busca é a máquina de fora. A VPS não guarda
credencial nenhuma do destino — quem invadir a VPS não consegue apagar as cópias
externas.

## Metade 1 — na VPS (já instalada)

- Script: `/usr/local/bin/arenatech-backup-db.sh` (versionado em [`deploy/scripts/backup-db.sh`](../../deploy/scripts/backup-db.sh))
- Units: `arenatech-backup-db.{service,timer}` (versionados em [`deploy/systemd/`](../../deploy/systemd/))
- Horário: **02:30 BRT**, antes da leva das 03:00 — o dump retrata o dia fechado, não um estado no meio das rotinas noturnas
- Retenção: **14 cópias** (~170 MB no total; o dump de 29/07 tinha 12 MB)
- Modo: `0600`, dono root

Duas guardas contra o pior tipo de backup, o que parece existir e não presta:

1. **Piso de tamanho** (5 MB): dump abaixo disso é truncado e é descartado.
2. **`gzip -t`**: lê o arquivo inteiro e pega corrupção que o tamanho não pega.

Em qualquer dos dois casos o script **falha e não grava nada** — melhor um job
vermelho no journal do que um arquivo inútil com cara de backup.

Escreve em `.partial` e só renomeia no fim, para o pull nunca copiar um arquivo
pela metade.

### Verificar

```bash
systemctl list-timers --all | grep backup-db      # deve estar agendado
systemctl is-enabled arenatech-backup-db.timer    # enabled
ls -lh /home/deployer/backups/db/                 # até 14 arquivos
journalctl -u arenatech-backup-db.service -n 20 --no-pager
```

Sinal de sucesso no journal: `OK: /home/deployer/backups/db/arenatech_….sql.gz (12M) — N cópias retidas`.

## Metade 2 — pull para o PC (WSL2)

Rodar **no WSL2 do PC que já hospeda o Esplora** (fica ligado 24/7).

1. Chave SSH para a VPS, se ainda não houver:

```bash
ssh-keygen -t ed25519 -C "backup-pull-pc"
ssh-copy-id root@194.34.232.81        # ou o alias que você usa
ssh root@194.34.232.81 'echo ok'      # tem que responder sem pedir senha
```

2. Script de pull:

```bash
mkdir -p ~/arenatech-backups
cat > ~/bin/pull-arenatech-backup.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
DEST="$HOME/arenatech-backups"
HOST="root@194.34.232.81"
KEEP=30

mkdir -p "$DEST"
LATEST="$(ssh "$HOST" 'ls -t /home/deployer/backups/db/arenatech_*.sql.gz | head -1')"
[ -n "$LATEST" ] || { echo "sem dump na VPS" >&2; exit 1; }

BASE="$(basename "$LATEST")"
[ -f "$DEST/$BASE" ] && { echo "já tenho $BASE"; exit 0; }

scp "$HOST:$LATEST" "$DEST/$BASE.partial"
gzip -t "$DEST/$BASE.partial" || { rm -f "$DEST/$BASE.partial"; echo "gzip corrompido" >&2; exit 1; }
mv "$DEST/$BASE.partial" "$DEST/$BASE"

cd "$DEST" && ls -t arenatech_*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "OK: $BASE"
SH
chmod +x ~/bin/pull-arenatech-backup.sh
```

3. Agendar (03:30 BRT, uma hora depois do dump da VPS):

```bash
crontab -e
# 30 3 * * * /bin/bash $HOME/bin/pull-arenatech-backup.sh >> $HOME/arenatech-backups/pull.log 2>&1
```

> WSL2 nem sempre sobe o `cron` sozinho. Confirme com `service cron status` e,
> se necessário, habilite o início automático da distro.

4. **Confirmar que funcionou** (não confie no `crontab -e`):

```bash
bash ~/bin/pull-arenatech-backup.sh   # deve imprimir OK: arenatech_….sql.gz
ls -lh ~/arenatech-backups/
```

## Restaurar

O procedimento é o mesmo do [`scripts/audit/restore-prod-copy.sh`](../../scripts/audit/restore-prod-copy.sh),
que já foi exercitado de ponta a ponta em 2026-07-29 (restauração local com zero
erro, 197 migrations, 7 tenants).

```bash
# Local, para conferir um dump:
gunzip -c arenatech_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i arenatech-postgres psql -U arenatech -d arenatech_restore
```

O dump sai com `--no-acl`, então os `GRANT` de `app_user`/`app_admin` se perdem.
Sem reaplicá-los o app loga e toma `permission denied for table users` —
`withTenant` faz `SET ROLE app_user`. O script de restore já reaplica.

> **Backup que nunca foi restaurado não é backup.** Restaure um dump de verdade
> a cada trimestre e anote a data aqui.
>
> | Data | Dump testado | Resultado |
> |---|---|---|
> | 2026-07-29 | `prod_20260729` | Restaurado local, 0 erro, app subiu contra a cópia |
