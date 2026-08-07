# Fiscal / NF-e — pré-requisitos antes de ligar

> **Estado em 2026-08-07: o fiscal NÃO está operante em produção, e isso é
> deliberado** — declarado fora de escopo no início do programa de
> comercialização, até a escolha da API de emissão.
>
> Este documento existe para que os pré-requisitos não sejam redescobertos no
> dia em que você for ligar. Levantados na auditoria da Etapa 8, Módulo 3.

## O que está medido hoje (produção)

| verificação | resultado |
|---|---|
| `PFX_ENCRYPTION_KEY` no container | **ausente** |
| `PFX_ENCRYPTION_KEY` no `.env.production` da VPS | **ausente** |
| `PFX_ENCRYPTION_KEY` no `docker-compose.deploy.yml` | **ausente** |
| certificados cadastrados (`certificate_url`) | **0** |
| tenants com `enabled = true` | **0** |

O sistema **falha fechado**: sem a chave, `getEncryptionKey()` lança e o upload
aborta antes de gravar qualquer coisa. Verificado executando no container de
produção:

```
FALHA: PFX_ENCRYPTION_KEY nao esta configurado
```

Não é degradação silenciosa — é uma porta que não abre.

---

## Pré-requisito 1 — provisionar a chave de cifra

A variável está documentada em `.env.example:227` e **vazia em produção**.

```bash
openssl rand -base64 32
```

O valor precisa entrar em **dois lugares**, senão o container não a enxerga:

1. `/home/deployer/arenatech-app/.env.production` na VPS
2. o `docker-compose.deploy.yml`, para ser repassada ao serviço

`getEncryptionKey()` valida que a chave decodifica para **exatamente 32 bytes** —
chave curta ou mal colada falha no boot da operação, não em silêncio.

### Por que 32 bytes e não uma senha

A chave é usada direto como chave AES-256, sem KDF. Uma senha digitada teria
entropia muito abaixo de 256 bits. Use `openssl rand`, não uma frase.

---

## Pré-requisito 2 — decidir onde a chave vive

**Este é o ponto que exige decisão, não execução.**

Se a chave ficar apenas no `.env.production` da VPS, **a chave e os certificados
cifrados estarão na mesma máquina**. Quem obtiver acesso ao servidor tem os
dois — e a cifra deixa de proteger contra o cenário que mais importa
(comprometimento do host).

O mesmo vale para o backup: se o dump do `.env` e o bucket do MinIO forem para o
mesmo destino, o backup off-site herda o problema.

Opções, da mais simples à mais robusta:

| opção | protege contra | custo |
|---|---|---|
| chave só no `.env.production` | vazamento do bucket MinIO isolado | zero (estado atual do desenho) |
| chave em cofre externo (ex.: 1Password/Vault), injetada no deploy | comprometimento do host | operacional: o deploy passa a depender do cofre |
| chave em cofre + rotação documentada | vazamento da própria chave | exige re-cifrar os certificados existentes |

**Não há decisão tomada.** Enquanto houver 0 certificados, o risco é teórico; no
primeiro upload, deixa de ser.

---

## Pré-requisito 3 — rotação (só faz sentido depois do 1 e do 2)

Não existe procedimento de rotação hoje, e **não faz falta enquanto a chave não
existir**. Quando existir, rotacionar significa:

1. gerar a chave nova;
2. **decifrar com a antiga e re-cifrar com a nova** cada `.pfx` no MinIO —
   `certificate_iv` e `certificate_auth_tag` mudam por certificado;
3. só então descartar a antiga.

Trocar a variável sem re-cifrar torna **todos** os certificados ilegíveis, e o
erro aparece na emissão da nota, não no deploy.

---

## O que já está correto (não mexer)

A criptografia foi bem construída — o que falta é operação, não código:

- **AES-256-GCM** com IV de 12 bytes **aleatório por operação**
  (`pfx-encryption.service.ts`)
- **`authTag` verificado** na decifragem — adulteração do arquivo no bucket é
  detectada, não ignorada
- **a senha do `.pfx` é validada e descartada**, nunca persistida
- o arquivo vai para `tenants/{id}/certificates/`, prefixo **bloqueado** no
  `/api/storage` desde o PR #829 (B4) — o proxy público devolve 404 sem tocar no
  bucket
- `updateFiscalCertificate` e `removeFiscalCertificate` exigem admin do tenant
  (verificado no navegador: operador recebe **403**)
- `getFiscalSettings` usa **whitelist explícita** de campos — o certificado e o
  IV não saem por leitura, por construção

---

## Ordem recomendada no dia de ligar

1. Escolher a API de emissão (decisão de produto ainda pendente)
2. Decidir o **pré-requisito 2** — onde a chave vive
3. Provisionar a chave (**pré-requisito 1**)
4. Subir um certificado de homologação e emitir **em ambiente de teste**
5. Só então habilitar `enabled = true` para o tenant
6. Documentar a rotação (**pré-requisito 3**) antes do primeiro certificado de
   produção
