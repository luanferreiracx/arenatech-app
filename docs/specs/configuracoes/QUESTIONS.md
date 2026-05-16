# QUESTIONS — Configurações

## Q1. Formas de pagamento: seed inicial inclui DEPIX?

**Contexto:** O legacy tem 8 formas na constante `FORMAS_PAGAMENTO` incluindo `depix`, `parcelado`, `crediario`, `misto`. No prompt do dono, M8 define 4 fixas: Dinheiro, PIX, Cartão Crédito, Cartão Débito.
**Pergunta:** As outras 4 (DePix, Parcelado, Crediário, Misto) devem ser criadas como formas customizadas no seed, ou ficam fora do seed e o tenant adiciona se quiser?
**Default proposto:** Não incluir no seed das fixas. DePix vira customizada se tenant habilitar integração DePix. "Parcelado" e "Misto" não são formas reais — são modos de pagamento (split payment, já implementado na Fase 8). "Crediário" pode ser customizada.
**Impacto:** Baixo (UX seed vs config manual).

## Q2. ConfiguracaoAssistencia vs TenantGeneral — merge total?

**Contexto:** O legacy tem 2 modelos separados: `ConfiguracaoAssistencia` (nome, CNPJ, telefone, email, endereço, logo, termos, garantia, horário) e o key-value (nome_loja, cnpj_loja, telefone_loja, logo_loja, endereco_loja). Os campos de identificação (nome, CNPJ, telefone, email, endereço, logo) estão DUPLICADOS entre os dois.
**Premissa tomada:** Mesclar campos de identificação em TenantGeneral e manter TenantAssistanceSettings apenas para termos e políticas textuais. Confirma?
**Impacto:** Médio (simplificação de schema).

## Q3. Código município IBGE — auto-fill a partir de ViaCEP?

**Contexto:** ViaCEP retorna `ibge` no response (código IBGE do município). Seria útil preencher automaticamente `municipalityCode` na tab Fiscal quando CEP é buscado.
**Pergunta:** Implementar auto-fill de código município via ViaCEP na tab Fiscal?
**Default proposto:** Sim, aproveita o fetch que já é feito.
**Impacto:** Baixo (UX improvement, zero custo adicional).

## Q4. Certificado .pfx — parsing server-side em Node.js

**Contexto:** Parsear .pfx em Node.js requer lib tipo `node-forge` ou `@pkcs12/parser`. Extrair data de expiração exige abrir o certificado com a senha.
**Pergunta:** Qual lib usar? `node-forge` é a mais popular para PKCS#12 em Node.js.
**Default proposto:** `node-forge` (MIT, 0 deps nativas, funciona em Docker).
**Impacto:** 1 dependência nova no projeto.

## Q5. Cache Redis — invalidar automaticamente ao salvar?

**Contexto:** Outros módulos (PDV, Fiscal, OS) leem configurações com frequência. Se cacheamos em Redis, precisamos invalidar ao salvar.
**Pergunta:** Implementar cache Redis com invalidação automática via tRPC mutation hook, ou deixar sem cache por enquanto (Postgres com RLS é rápido o suficiente para reads simples de singleton)?
**Default proposto:** Sem cache por enquanto. Singleton reads são < 5ms em Postgres local. Adicionar cache quando/se performance for problema real.
**Impacto:** Simplicidade vs futuro (premature optimization vs. eventual necessity).
