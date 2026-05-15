# ASSUMPTIONS: Clientes

> Premissas tomadas durante a SPEC. Cada uma numerada, descrita, com razão.

---

## A1. Enum values em inglês UPPERCASE

**Premissa:** Enums (CustomerType, InterestType, InterestStatus, InteractionType) usam valores em inglês UPPERCASE (PF, PJ, PURCHASE, WAITING, etc.). Labels em português são responsabilidade da UI.

**Razão:** Alinhado com realidade#12 (inglês internamente). Consistente com enums já existentes no sistema (ServiceOrderStatus, SaleStatus, etc.).

**Reversível:** Sim, mas impacta toda a stack.

---

## A2. Sem auditoria de mudanças (CustomerHistory) nesta versão

**Premissa:** Não criamos tabela de auditoria específica para clientes. Alterações são rastreáveis pelo `updatedAt` mas sem log de campos alterados.

**Razão:** O legacy não tem auditoria de clientes. O sistema já tem `AuditLog` genérico (Fase 2). Se necessário, pode-se ativar audit logging no Prisma middleware globalmente.

**Reversível:** Sim, adicionar tabela de histórico é aditivo.

---

## A3. Timestamps de criação do MySQL migram para `createdAt`

**Premissa:** Na migração de dados, `data_cadastro` / `criado_em` do legacy mapeia para `createdAt`. `data_atualizacao` / `atualizado_em` mapeia para `updatedAt`.

**Razão:** Padronização. O legacy tinha inconsistência (migration usava `data_cadastro`, model usava `criado_em` via const override).

**Reversível:** N/A (migração de dados é one-shot).

---

## A4. Interest é entidade 100% autônoma (sem FK para Customer) — CONFIRMADA

**Premissa:** Interest tem sua própria listagem, CRUD e rota (`/interests`). NÃO tem FK para Customer. São entidades completamente independentes.

**Razão:** Reflete o design do legacy onde `interesses_clientes` não tem FK para `clientes`. **Confirmado pelo dono em Q3: vínculo desnecessário.**

**Reversível:** Sim, pode-se adicionar FK depois se necessário.

---

## A5. Envio em lote de WhatsApp é stub funcional

**Premissa:** A funcionalidade de envio em lote para interesses é especificada com contrato de stub. Na implementação, chamará o módulo Comunicação quando este for especificado. Enquanto isso, a procedure tRPC existe mas retorna `{ sent: 0, errors: 0 }` com log.

**Razão:** Módulo Comunicação não foi especificado ainda. Não podemos implementar envio real sem definir o contrato completo de WhatsApp.

**Reversível:** Sim, stub vira implementação real quando Comunicação for especificado.

---

## A6. Soft delete com partial unique index — CONFIRMADA

**Premissa:** CPF e CNPJ usam partial unique index (`WHERE deleted_at IS NULL`). Isso permite reuso de CPF/CNPJ após soft delete de um cliente.

**Razão:** Cenário real: cliente cadastrado errado → excluído → recadastrado com mesmo CPF. **Confirmado pelo dono em Q1 (decisão B).**

**Reversível:** Sim, pode-se trocar para unique absoluto.

---

## A7. Tipos de interesse reais do legacy prevalecem sobre inventário

**Premissa:** Os tipos de interesse são `PURCHASE`, `SALE`, `TRADE`, `REPAIR` (tradução dos valores reais da migration: `Compra`, `Venda`, `Troca`, `Reparo`). O inventário mencionava "aparelho/servico/acessorio" que NÃO corresponde ao código real.

**Razão:** Leitura direta da migration `enum('tipo_interesse', ['Compra', 'Venda', 'Troca', 'Reparo'])` prevalece.

**Reversível:** N/A (fato, não decisão).
