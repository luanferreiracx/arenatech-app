# QUESTIONS: Clientes

> Perguntas que precisam de decisão do dono antes de implementar.

---

## Q1. CPF/CNPJ reutilizável após exclusão?

**Contexto:** Cliente excluído via soft delete tem `deletedAt` preenchido mas registro continua no banco. O índice unique `(tenantId, cpf)` impediria reuso. Se um novo cliente tentar usar mesmo CPF, deve bloquear ou permitir?

**Hipótese A:** Bloquear sempre (CPF é único histórico). Justificativa: cliente pode ser restaurado, e ter dois registros com mesmo CPF causa confusão.

**Hipótese B:** Unique constraint filtrada: `WHERE deletedAt IS NULL`. Permite reuso após exclusão. Justificativa: na prática, é o equivalente a "deletar e recadastrar". Postgres suporta `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`.

**Default proposto:** Hipótese B (partial unique index). É mais flexível e cobre o cenário de recadastro. Se o cliente original precisar voltar, usa Restaurar em vez de criar novo.

**Impacto:** Médio — afeta schema (partial index) e lógica de unicidade.

---

## Q2. Interest precisa de campo `priority` (prioridade)?

**Contexto:** O inventário legacy mencionava "prioridade" no model Interesse, mas a migration real (`interesses_clientes`) NÃO tem coluna `prioridade`. O controller não filtra por prioridade. O model Interesse.php não tem campo `prioridade` no `$fillable`.

**Hipótese A:** Não existe prioridade — o inventário estava errado. Não adicionar.

**Hipótese B:** Adicionar prioridade (LOW/MEDIUM/HIGH) como melhoria.

**Default proposto:** Hipótese A (não adicionar). SPEC replica o que existe, não inventa.

**Impacto:** Nenhum se A.

---

## Q3. Interesse vinculado a Cliente existente?

**Contexto:** No legacy, `interesses_clientes` NÃO tem FK para `clientes`. São entidades totalmente separadas. A SPEC adicionou `customerId` como FK opcional (para permitir conversão de lead em cliente). Isso é uma mudança aprovada ou deve ser removido?

**Default proposto:** Manter `customerId` opcional. Permite vincular lead a cliente quando convertido, sem quebrar compatibilidade (null = lead autônomo).

**Impacto:** Baixo — campo opcional, nenhuma regra de negócio depende dele inicialmente.

---

## Q4. Interesse com `data_follow_up`?

**Contexto:** O inventário mencionava `data_follow_up` no model Interesse, mas a migration real NÃO tem esse campo. O model `$fillable` não inclui. Aparenta ser informação do inventário que não existe no código real.

**Default proposto:** Não incluir. Se necessário, pode ser adicionado depois.

**Impacto:** Nenhum.

---

## Q5. Envio em lote — qual template Meta usar?

**Contexto:** O legacy usa `enviarComFallbackTemplate` com contexto `'interesse_followup'`. Esse template precisa estar aprovado pela Meta. No Next.js, o módulo Comunicação ainda não foi especificado. A implementação de envio em lote deve:

**Hipótese A:** Usar o mesmo contrato (stub `CommunicationService.sendBatch`), template definido na SPEC de Comunicação.

**Hipótese B:** Implementar envio simples (texto puro) sem template, sem módulo Comunicação.

**Default proposto:** Hipótese A (stub). Envio em lote é funcionalidade real do legacy. Implementação depende da SPEC de Comunicação.

**Impacto:** Médio — funcionalidade fica como stub até Comunicação ser especificado.
