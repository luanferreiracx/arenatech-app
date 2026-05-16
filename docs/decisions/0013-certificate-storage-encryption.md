# ADR 0013: Certificado digital .pfx encriptado em MinIO

## Status
Aceita

## Contexto
Certificado digital A1 (.pfx) contém chave privada do emitente. No legacy, armazenado no filesystem local com senha em plaintext no banco (`fiscal_certificado_senha`). Inseguro.

## Decisão
1. Arquivo .pfx encriptado com AES-256-GCM antes do upload ao MinIO
2. Chave de criptografia em variável de ambiente: `CERTIFICATE_ENCRYPTION_KEY`
3. Senha do certificado NÃO armazenada — pedida ao usuário a cada uso (módulo Fiscal)
4. Path no MinIO: `tenants/{tenantId}/certificates/{uuid}.pfx.enc`

## Consequências
- Segurança: mesmo com acesso ao MinIO, arquivo é inútil sem a env var
- UX: owner precisa lembrar a senha do certificado (ou usar gerenciador de senhas)
- Operacional: se `CERTIFICATE_ENCRYPTION_KEY` for perdida, certificados ficam irrecuperáveis (mitigação: backup da env var)
- Módulo Fiscal: ao emitir NF-e, decifera o .pfx com env var e então abre com senha fornecida pelo owner na hora
