# Provisionamento da Esplora Liquid (ADR 0059)

Monta do zero a fonte on-chain própria do LWK — `elementsd` (nó Liquid watch-only)
+ `waterfalls` (backend Esplora) — no PC dedicado, exposta por Cloudflare Tunnel.

Existe porque já montamos isso **duas vezes à mão**: a segunda depois de o PC ser
formatado (2026-07-28), perdendo tudo. Cada armadilha que custou horas está
comentada no ponto do script onde importa.

## Ordem

| # | Onde | Comando |
|---|------|---------|
| 1 | Windows (PowerShell **como Admin**) | `.\01-windows-bootstrap.ps1` |
| 2 | Do Mac | `ssh esplora-pc 'echo ok'` — confirma o acesso |
| 3 | WSL2 (root) | `bash 02-wsl-provision.sh` |
| 4 | Cloudflare | criar/reapontar o túnel → `CF_TOKEN=... bash 02-wsl-provision.sh` |
| 5 | Esperar | IBD do Liquid (~4M blocos) |
| 6 | VPS | cutover do `ESPLORA_URL` |

## As quatro armadilhas que custaram caro

1. **WSL2 desliga a distro ~20s após a última sessão SSH sair.** Foi a causa-raiz
   de todos os fracassos da primeira montagem: matava `cloudflared` e os
   containers assim que o SSH caía. A tarefa agendada `WSLEsploraKeepAlive`
   (`sleep infinity`) segura a distro viva. **Sem ela nada persiste em background.**

2. **`trim_headers=1` no `elements.conf` é obrigatório.** Sem isso o nó carrega
   ~4M headers em RAM (~4GB RSS), o cgroup mata, e ele entra em loop de OOM —
   foram 40 restarts até descobrir. Com o flag: 1,66GB e IBD ~3x mais rápido.

3. **Medir progresso pelo `waterfalls` engana.** O tip do waterfalls fica MUITO
   atrás do elements (mostrou 18% quando o nó estava a 90%) e o campo "X blocks/s"
   do log é **média de vida**, não taxa atual. O número autoritativo é
   `elements-cli getblockcount`; para taxa real, faça delta de blocos entre duas
   leituras espaçadas.

4. **Chave SSH de usuário admin no Windows vai em
   `C:\ProgramData\ssh\administrators_authorized_keys`**, com ACL restrita a
   Administrators+SYSTEM — não em `~/.ssh/authorized_keys`. No lugar errado, o
   login falha sem explicar.

## Rede: por que Cloudflare Tunnel e não Tailscale

Tailscale foi tentado e falhou de quatro formas (mirrored-inbound, portproxy não
recebe Tailscale, serve-TLS, e Tailscale-dentro-do-WSL2 vira 2 nós atrás de 1 NAT
doméstico). O túnel resolve porque é conexão de **saída**: não depende de NAT,
firewall ou porta aberta no roteador. O `cloudflared` roda dentro do WSL2 e fala
com o waterfalls por `localhost:3100`.

## Operação

```bash
# Progresso do IBD (autoritativo)
wslrun 'docker exec elements elements-cli -datadir=/data -conf=/etc/elements/elements.conf \
  getblockchaininfo | jq "{blocks,headers,verificationprogress,initialblockdownload}"'

# Indexação do waterfalls
wslrun 'docker logs waterfalls --tail 20'

# Destravar WSL2 que congelou sob carga (erro 0x8007274c): do lado Windows
ssh esplora-pc 'wsl.exe --shutdown && schtasks /run /tn WSLEsploraKeepAlive'
```

O helper `wslrun` (executa comando no WSL2 via SSH, com base64 para sobreviver às
camadas de escape) está descrito em `docs/runbooks/waterfalls-esplora.md`.

## Cutover — só depois de `initialblockdownload:false` **e** waterfalls no tip

Antes de promover, comparar tip e saldo/UTXOs da carteira central contra uma
Esplora pública. Promover cedo faz o LWK enxergar chain parcial — exatamente o
tipo de leitura truncada que já custou um cache corrompido.

Depois do cutover, **remover o auto-reparo interino** da VPS:
`systemctl disable --now depix-cache-autorepair.timer`.
