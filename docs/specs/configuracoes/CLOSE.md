# Encerramento — Módulo Configurações

**Data de encerramento:** 2026-05-16

---

## Decisão do dono

Caminho 1: aceitar e seguir. Validação retroativa pulada.

---

## Dívidas técnicas registradas

1. **Upload certificado .pfx encriptado** — adiado para quando módulo Fiscal precisar decifrar. Campo `certificateUrl` existe no schema (TenantFiscalSettings).

2. **17 cenários E2E adiados** — serão implementados no batch final de testes do projeto. Cobertura atual = unit + integration.

3. **Campo `businessHours` em TenantSettings** — origem validada: mapeado de `horario_funcionamento` no KEY_VALUE_INVENTORY.md (chave real do Laravel). Não é feature adicionada além do escopo — é réplica fiel.

---

## Próximo módulo

**Estoque** — conforme plano de migração.
