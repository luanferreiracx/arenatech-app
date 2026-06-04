# ADR 0047 — Cloudinary como provider principal para imagens de produto/catálogo

**Status:** aceito
**Data:** 2026-06-04
**Contexto:** Migração de imagens legadas Laravel + operação de catálogo/estoque

## Contexto

A ADR 0017 definiu MinIO + Sharp para imagens de produto, com uma migração futura Cloudinary → MinIO. A decisão fazia sentido pela padronização da stack, mas o cenário operacional mudou:

- o Laravel já usa Cloudinary para imagens de produtos/catálogo;
- as imagens legadas já estão hospedadas e servidas por CDN;
- o plano free do Cloudinary atende ao volume atual;
- reprocessar e servir imagens públicas pela VPS/MinIO aumentaria carga operacional sem ganho imediato.

## Decisão

Cloudinary passa a ser o provider principal para imagens públicas de produtos, variações e catálogo.

MinIO continua na stack para assets internos/privados e fluxos já implementados, como logos, documentos e anexos que não precisam de CDN pública.

## Implementação

- Novos uploads de imagens de produto/variação usam `PRODUCT_IMAGES_PROVIDER=cloudinary` por padrão.
- `PRODUCT_IMAGES_PROVIDER=minio` permanece como rollback/fallback.
- O contrato atual de URLs é mantido:
  - `ProductPhoto.url`
  - `ProductPhoto.thumbUrl`
  - `ProductPhoto.mediumUrl`
  - `Product.imageUrl`
  - `ProductVariation.imageUrl`
  - `CatalogDevice.imageUrl`
- Metadados opcionais registram origem e identidade do asset:
  - `provider`
  - `providerPublicId`
  - campos equivalentes para variações e catálogo.
- Imagens legadas já no Cloudinary não são baixadas nem reupadas.
- Um backfill idempotente apenas classifica URLs existentes e extrai `public_id` quando possível.

## Consequências

### Positivas

- Reduz processamento com Sharp na VPS para imagens públicas.
- Evita tráfego de mídia pública saindo do servidor da aplicação.
- Preserva URLs legadas do Laravel.
- Usa CDN e transformações do Cloudinary para thumbnails e versões médias.
- Rollback simples para MinIO por variável de ambiente.

### Trade-offs

- Produto/catálogo passam a depender de um serviço externo para novos uploads.
- Delete confiável no Cloudinary depende de `providerPublicId`; URLs legadas sem public id parseável terão cleanup best-effort.
- MinIO e Cloudinary coexistem, então a aplicação precisa manter lógica de provider.

## ADR supersedida parcialmente

Esta ADR supersede a parte da ADR 0017 que tratava MinIO + Sharp como destino principal de imagens de produto/catálogo. A ADR 0017 continua válida como histórico e como referência para o fallback MinIO.
