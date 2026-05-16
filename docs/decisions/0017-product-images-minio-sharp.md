# ADR 0017 — Imagens de Produto: MinIO + Sharp

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Estoque-A (Catálogo de Produtos)

## Problema

O Laravel usa Cloudinary para imagens de produtos. Na nova stack, precisamos de storage de objetos.

## Decisão

**MinIO para storage + Sharp para processamento.**

### Storage (MinIO)

- Bucket: `arenatech`
- Paths: `tenants/{tenantId}/products/{productId}/{photoId}-{size}.webp`
- Servido via Nginx com cache (sem CDN externa por enquanto)

### Processamento (Sharp)

Cada upload gera 3 versões automaticamente:

| Versão | Dimensão | Formato | Qualidade |
|--------|----------|---------|-----------|
| thumb | 200x200 (cover) | WebP | 80 |
| medium | 600x600 (inside) | WebP | 85 |
| original | max 2000x2000 (inside) | WebP | 90 |

### Limites

- Máximo 10MB por upload (validado server-side)
- Formatos aceitos: JPG, PNG, WebP (outros rejeitados)
- Máximo 3 fotos por produto (regra de negócio do legacy)
- 1 imagem por variação

## Justificativa

- MinIO já está na stack (Docker Compose desde Fase 0)
- Sharp é o padrão Node.js para image processing (performante, sem dependências binárias complexas)
- WebP oferece compressão superior (30-50% menor que JPEG para mesma qualidade)
- 3 versões cobrem todos os casos de uso (listagem, detalhe, zoom)
- Sem CDN: sistema interno, ~10 usuários simultâneos — Nginx com cache é suficiente

## Migração de dados

- Imagens existentes no Cloudinary NÃO serão migradas automaticamente nesta fase
- Sistema novo começa com produtos sem imagens
- Usuários reuploadarão conforme necessidade
- Migração Cloudinary→MinIO é tarefa separada (não no escopo desta SPEC)

## Dívida técnica registrada

- Presigned URLs para uploads diretos client→MinIO (bypass do server)
- CDN externa (Cloudflare R2 ou CloudFront) se latência for problema
- Lazy migration de imagens do Cloudinary via script batch
