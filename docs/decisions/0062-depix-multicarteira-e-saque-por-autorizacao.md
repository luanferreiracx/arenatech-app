# ADR 0062 — DePix multi-carteira: proteções por tenant e saque por autorização

## Status

Aceito — 2026-08-02. Complementa o ADR 0061 (comercialização self-service) e o
ADR 0051 (carteira non-custodial). Não revoga nenhum dos dois.

## Contexto

A pergunta que originou este trabalho foi comercial: **dá para abrir cadastro de
clientes novos?** A investigação em produção respondeu que não, e o motivo não é
"o DePix está quebrado" — ele estava estável no dia. O motivo é que toda a rede
de proteção do DePix foi construída em volta de **uma** carteira, e cadastrar
cliente é multiplicar carteiras.

Medições de 2026-08-02, em produção:

| Fato | Valor |
|---|---|
| Carteiras com cache do LWK | 4 (2 da Arena, 2 de cliente) |
| Divergência entre a central e sua carteira espelho | **R$ 2.362,44** |
| L-BTC da central | 10.328 sats, contra um piso de 10.000 |
| Saques recusados pelo provedor com erro em inglês | 7 |
| Carteiras de cliente que podiam sacar pela API de parceiros | **0 de 3** |

Cada linha é um mecanismo distinto:

**1. As proteções cobriam só a central.** O detector de UTXO gasto, a guarda de
saque e o auto-reparo tinham a central hardcoded. A carteira espelho do tenant
NO-KYC — mesmo descriptor, mesma carteira on-chain — divergia R$ 2.362,44 sem
detector, sem reparo e sem alarme. Reparar uma não repara a outra, e ninguém
reparava a segunda.

**2. O alarme de gás avisava tarde demais.** O piso do L-BTC era o único limiar.
Quando dispara, o próximo tenant que tentar sacar já falha. Cada carteira nova
consome um refill de 5.000 sats no primeiro saque; 10.328 sats davam para dois
clientes.

**3. A recusa do provedor chegava crua ao lojista.** Em inglês, mandando falar
com "our support team" — o suporte da Eulen, onde o lojista não tem conta. Ele
batia numa porta que não abre para ele.

**4. O saque da API de parceiros era superfície morta.** Exigia carteira
custodial, e desde o ADR 0051 nenhum cliente é custodial: `setupWallet` só cria
`non_custodial` ou `external`, e o caminho custodial (`lwk.createWallet`) não tem
um único chamador no app. O endpoint da Fase 3 do ADR 0057 estava inalcançável
por 100% dos tenants reais, e o CI ficava verde porque os testes mockavam uma
carteira custodial que o produto não produz mais.

**5. O ADR 0061 tornou a carteira sempre-ligada para todo mundo.** O argumento
está inteiro — a carteira guarda o dinheiro do cliente e nenhuma decisão
comercial nossa pode separá-lo dele. O efeito colateral não estava previsto:
abrir cadastro jogaria 100% dos clientes novos na superfície mais frágil do
sistema, inclusive quem contratou para vender celular.

## Decisão

### As proteções passam a ser por carteira, com orçamento e rotação

Detector, guarda de saque e auto-reparo valem para qualquer carteira. Como cada
checagem custa Esplora pública — e Esplora sobrecarregada é a causa da corrupção
que estamos detectando —, cada rodada trata um lote e avança um cursor em anel.

Trocar "uma carteira protegida" por "as N primeiras protegidas" repetiria o bug
de origem em escala maior; o anel é o que impede isso, e o que sobra é logado.

### O gás avisa antes de acabar

Dois degraus: `warning` (fôlego abaixo de 4 refills, sai como `warn`) e
`critical` (abaixo do piso, segue `error`). O fôlego é medido em refills, que é a
unidade que responde à pergunta de quem opera.

### A recusa do provedor vira frase acionável

Cada recusa conhecida é traduzida, diz de quem é o problema (do saque ou da conta
da Arena) e o que fazer. Mensagem desconhecida é repassada inteira — tradução
errada manda o lojista fazer a coisa errada com confiança.

Descobrimos aqui que o limite diário da Eulen é **por chave PIX de destino**
(R$ 6.000/dia), não por conta: a documentação não publica limite nenhum, o número
veio da recusa dela. Um pré-voo recusa antes de chamar a Eulen quando nossos
próprios registros já mostram a chave estourada.

### A carteira deixa de ser imposta

`wallet` e `depix-ops` passam a depender de `Tenant.depixEnabled`. O princípio do
ADR 0061 é preservado por duas travas: a suspensão por inadimplência **não**
derruba o piso da carteira, e desligar o gate é recusado quando a carteira está
provisionada. O ADR 0061 protege quem tem dinheiro na carteira; ele não obriga a
dar carteira a quem não pediu.

### O saque da API vira pedido + autorização humana

Roteamento por modelo de custódia:

- **external** → `createExternalWithdraw`, que já existia. Sem chave nossa
  envolvida.
- **custodial** → caminho direto (hoje, só as carteiras de infraestrutura).
- **non_custodial** → **a máquina pede, a pessoa autoriza**. A API cria um pedido
  e não move nada; o titular conclui no painel com 2FA e a senha da carteira.

## Alternativas consideradas

**Aceitar a passphrase num header de API.** Resolveria o saque non-custodial em
uma linha. Rejeitada: desmontaria a garantia inteira do ADR 0051 — a Arena
passaria a poder gastar sozinha o dinheiro do cliente, que é exatamente o que o
modelo promete que não acontece.

**Uma "sessão de carteira" destravada por N minutos.** O servidor guardaria a
chave decifrada durante uma janela. Rejeitada pelo mesmo motivo, com o agravante
de mover a fronteira de segurança para um TTL — e um TTL não é uma garantia
criptográfica, é uma promessa operacional.

**Migrar clientes de volta para custodial.** Rejeitada. Andar para trás em
custódia de dinheiro alheio aumenta o risco regulatório e o blast radius.

**Reescrever `createWithdraw` para nascer em dois passos.** Seria mais elegante
que um agregado novo na frente dele. Rejeitada por risco: é o caminho que move
mais dinheiro no sistema, tem oito guardas acumuladas por incidente, e nenhuma
delas precisa mudar para este recurso existir.

**Manter o piso da carteira incondicional e só avisar o cliente do risco.**
Rejeitada: transferiria para o lojista uma decisão que é nossa.

## Consequências

**Positivas.** As proteções passam a escalar com o número de clientes em vez de
diluir. A carteira deixa de ser risco imposto. O saque da API sai do papel para
100% dos clientes. A recusa do provedor deixa de mandar o lojista a uma porta que
não abre.

**Negativas e a vigiar.**

O saque non-custodial via API deixa de ser síncrono: o parceiro recebe
`AWAITING_AUTHORIZATION` e precisa consultar depois. É inerente ao modelo, não um
defeito da implementação — mas exige que a integração do parceiro seja escrita
para isso, e a documentação precisa ser explícita.

A fila de autorização cria um risco novo: um pedido virar dois saques. Está
coberto por idempotência no pedido, CAS na autorização e chave de idempotência
derivada do pedido no saque — mas é a parte deste ADR que mais merece atenção em
review futuro.

O anel de rotação faz com que uma carteira específica não seja checada em toda
rodada. Com poucas carteiras é irrelevante; com muitas, o intervalo entre duas
checagens da mesma carteira cresce. Se isso passar a doer, o caminho é subir o
orçamento — não remover o anel.

**Fora de escopo.** A Esplora self-hosted (ADR 0059) continua sendo a correção da
raiz e continua pendente: em 2026-08-02 o elements estava em 33% de IBD e o
waterfalls precisava de reindex. Nada aqui substitui isso; tudo aqui é contenção
para operar com Esplora pública sem que a falha caia sobre o cliente.
