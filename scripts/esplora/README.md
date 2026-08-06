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

5. **`--max-txs-seen` é obrigatório, e sem ele o SALDO VEM ERRADO.** O default
   devolve no máximo 100 transações por endereço; o endereço mais movimentado da
   carteira central tem 415. As 315 restantes somem, e com elas 5 UTXOs
   (R$ 1.202) — saldo de R$ 7.702 em vez de R$ 8.905, sem erro e sem log.

   O que torna esta armadilha cara é que **todo o resto bate**: tip idêntico ao
   das públicas, bloco indexado, transação presente, endereço conhecido. Parece
   índice incompleto e não é — é a API truncando. Custou uma reindexação inteira
   de 6h atrás da hipótese errada.

   **Só um teste pega isso:** comparar saldo e contagem de UTXOs da carteira
   central contra uma Esplora pública, ANTES de promover a fonte. Tip igual não
   prova nada. Ver "Cutover" abaixo.

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

**Critério de aceitação — não promova sem isto.** Tip igual NÃO basta: já tivemos
tip idêntico ao da Blockstream com o saldo R$ 1.202 menor (ver armadilha 5). O
teste que vale é comparar saldo e contagem de UTXOs da carteira central:

```bash
# Roda dentro do container do LWK, que é onde a lib `lwk` existe.
# Compara a fonte própria contra as públicas usando o MESMO descriptor.
ssh contabo 'docker exec arenatech-lwk-wallet python3 /tmp/par.py'
# Aceite só com saldo e nº de UTXOs IDÊNTICOS aos das públicas.
```

Promover com índice truncado cria saldo subnotificado — o espelho do incidente do
saldo inflado: um saque legítimo passa a ser recusado por "saldo insuficiente"
que não existe.

Executado o cutover (`ESPLORA_URL=https://esplora.pdvdepix.app` no
`/opt/lwk-wallet/.env` + `docker compose up -d`), **remover o auto-reparo
interino** da VPS: `systemctl disable --now depix-cache-autorepair.timer`.

> **Se um dia a Esplora própria sair de operação** e o `ESPLORA_URL` voltar para
> as públicas, REATIVE o auto-reparo — ele é o que continha a corrupção de cache
> causada pelas respostas parciais delas.

### Cloudflare: o endpoint precisa de bypass

O `cloudflared` expõe o waterfalls, mas o Browser Integrity Check da Cloudflare
bloqueia o LWK com **HTTP 403 / error code 1010** — ele é um cliente Rust sem
cabeçalhos de navegador. Sintoma: `Server: cloudflare` na resposta de erro.

Correção: WAF → Custom rules → regra `Skip` para
`(http.host eq "esplora.pdvdepix.app")`, marcando Browser Integrity Check,
Managed Rules, Bot Fight Mode e Rate Limiting.

O endpoint serve dados públicos de blockchain (sem chaves, sem valores — na
Liquid os valores são confidenciais), então o afrouxamento é de baixo risco. Para
fechar depois, o caminho é um service token do Zero Trust.
