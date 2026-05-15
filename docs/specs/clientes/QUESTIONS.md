# QUESTIONS: Clientes

> Perguntas que precisam de decisão do dono antes de implementar.
> **Todas respondidas em 2026-05-15.**

---

## Q1. CPF/CNPJ reutilizável após exclusão?

**Decisão: Hipótese B** — Partial unique index (`WHERE deleted_at IS NULL`). Permite reuso após soft delete.

---

## Q2. Interest precisa de campo `priority` (prioridade)?

**Decisão: Hipótese A** — Não adicionar. Não existe no código real.

---

## Q3. Interesse vinculado a Cliente existente?

**Decisão: Desnecessário** — Remover `customerId` do Interest. Manter como entidade 100% autônoma (fiel ao legacy).

---

## Q4. Interesse com `data_follow_up`?

**Decisão: Não incluir.**

---

## Q5. Envio em lote — qual template Meta usar?

**Decisão: Hipótese A** — Stub com `CommunicationService.sendBatch`, template definido na SPEC de Comunicação.
