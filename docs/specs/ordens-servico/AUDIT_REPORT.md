# Audit Report — Módulo Ordens de Serviço (OS)

> Data: 2026-05-18
> Auditor: Claude (autonomo)
> Referência: Laravel `OrdemServicoController` (3.052 linhas) + `OrdemServicoOrcamentoController` + `OrdemServicoPdfController`.

## Estado encontrado

| Item                    | Laravel (referência)     | Next.js encontrado     | Status |
|-------------------------|--------------------------|------------------------|--------|
| Status enum             | 12 estados               | 13 estados (`WAITING_APPROVAL` adicional) | ✓ extensão consciente |
| Procedures              | ~47 actions controller   | 47 service-order + 7 checklist = 54 | ✓ paridade |
| Páginas                 | index, create, show, edit, orcamento publico, relatorio-tecnicos | listagem, wizard 5 steps, detalhe, edit, public link, technician-report | ✓ paridade |
| API routes (PDF/termos) | pdf, recibo, termo-entrega, termo-devolucao, orcamento | pdf, quote-pdf, recibo, termo-entrega, termo-devolucao | ✓ paridade |
| Schema ServiceOrder     | 100+ colunas (mistura de boolean + datetime para fluxos) | 78 colunas (consolidado) | ⚠ ver gaps |
| Checklist               | 15 colunas no banco + 15 colunas saida | JSONB `entryChecklist` + `exitChecklist` (15 itens) | ⚠ rótulos divergem |
| Device Info             | 6 booleans no banco       | JSONB `deviceInfo` (6 chaves) | ✓ paridade |
| ADRs                    | n/a                       | 0041 (stock reservation), 0042 (PDV-OS) | ✓ alinhado |
| E2E @business           | n/a                       | 14/14 passando (Nível 1+2) | ✓ |

## Diagnóstico detalhado

### Procedures verificadas (mapping Laravel → Next.js)

| Laravel controller          | Next.js procedure                | Status |
|-----------------------------|----------------------------------|--------|
| index                       | `list`                           | ✓      |
| create+store                | `create`                         | ✓      |
| show                        | `getById`                        | ✓      |
| edit+update                 | `update`                         | ✓      |
| updateStatus                | `updateStatus`                   | ⚠ ver gap G3 |
| destroy                     | `delete`                         | ✓      |
| cancelar                    | `cancel`                         | ✓      |
| descancelar                 | `uncancel`                       | ✓      |
| estornar                    | `refund`                         | ✓      |
| salvarMotivoCancelamento    | parte de `cancel`                | ✓      |
| confirmarAssinaturaFisica   | `confirmPhysicalSignature`       | ✓      |
| enviarAssinatura            | `sendForSignature`               | ✓      |
| verificarAssinatura         | `checkSignatureStatus`           | ✓      |
| enviarTermoEntrega          | `sendDeliveryTerm`               | ✓      |
| confirmarTermoEntregaFisico | `confirmPhysicalDeliveryTerm`    | ✓      |
| verificarTermoEntrega       | `checkDeliveryTermStatus`        | ✓      |
| enviarTermoDevolucao        | `sendReturnTerm`                 | ✓      |
| confirmarTermoDevolucaoFisico | `confirmPhysicalReturnTerm`    | ✓      |
| verificarTermoDevolucao     | `checkReturnTermStatus`          | ✓      |
| enviarRecibo                | `sendReceipt`                    | ✓      |
| enviarRastreamento          | `sendTracking`                   | ✓      |
| notificarConclusao          | (parte de `updateStatus`)        | ⚠ ver gap G6 |
| notificarEntregador         | `notifyDeliveryPerson`           | ✓      |
| criarOrcamento              | `createQuote`                    | ✓      |
| enviarOrcamento             | `sendQuoteWhatsApp`              | ✓      |
| cancelarOrcamento           | `cancelQuote`                    | ✓      |
| aprovarOrcamentoManual      | `approveQuoteManually`           | ✓      |
| verificarOrcamento          | `checkQuoteStatus`               | ✓      |
| paginaOrcamentoPublico      | `getQuoteByLink` (public)        | ✓      |
| aprovarOrcamentoPublico/rejeitar | `respondToQuote` (public)   | ✓      |
| atualizarInfoTecnicas       | `updateTechnicalInfo`            | ✓      |
| atualizarCusto              | `updateCosts`                    | ✓      |
| atualizarTecnico            | `updateTechnician`               | ✓      |
| enviarParaLaboratorio       | `sendToLab`                      | ✓      |
| confirmarRecebimentoLaboratorio | `receiveFromLab`             | ✓      |
| cancelarEnvioLaboratorio    | `cancelLab`                      | ✓      |
| ordensDoCliente             | `getByCustomer`                  | ✓      |
| resumo                      | `byPublicLink` (público)         | ✓      |
| adicionarItem               | `addItem`                        | ✓      |
| removerItem                 | `removeItem`                     | ✓      |
| buscarPecas                 | `searchParts`                    | ✓      |
| relatorioTecnicos           | `technicianReport`               | ✓      |
| gerarPixDepix               | `generatePix`                    | ✓      |
| cancelarPixDepix            | `cancelPix`                      | ✓      |
| PdfController.download/view | `/api/service-orders/[id]/pdf`   | ✓      |
| PdfController.recibo        | `/api/service-orders/[id]/recibo` | ✓     |
| PdfController.termoEntrega  | `/api/service-orders/[id]/termo-entrega` | ✓ |
| PdfController.termoDevolucao | `/api/service-orders/[id]/termo-devolucao` | ✓ |
| Orcamento PDF               | `/api/service-orders/[id]/quote-pdf` | ✓  |

### Páginas verificadas

| Página                         | Existente             | Notas |
|--------------------------------|-----------------------|-------|
| Listagem `/service-orders`     | ✓                     | stats cards, filtros, busca |
| Wizard `/service-orders/new`   | ✓ (5 steps)           | customer → device → problem+checklist → items → summary |
| Detalhe `/service-orders/[id]` | ✓ (1254 linhas)       | actions contextuais por status |
| Edit `/service-orders/[id]/edit` | ✓                   | exit checklist editável |
| Público `/os/[publicLink]`     | ✓                     | sem auth, mostra resumo |
| Relatório técnicos `/service-orders/technician-report` | ✓ | |

## Descobertas

### Gaps reais (impactam dados)

**G1 — Checklist: rótulos divergem do Laravel**
- Laravel: aparelho_liga, aparelho_vibra, botoes_ok, bluetooth_ok, wifi_ok, vidro_traseiro_ok, audio_ok, microfone_ok, cameras_flash_ok, touch_faceid_ok, aparelho_carrega, tela_frontal_ok, carregamento_cabo, carregamento_inducao, ima_magsafe (15)
- Next.js: display, touchscreen, battery, charging, wifi, bluetooth, camera, speaker, microphone, buttons, biometrics, faceId, gps, cellular, sensors (15)
- **Impacto:** mapeamento na migração de dados precisa converter cada coluna `check_entrada_*` para a chave correspondente no JSONB. Sem ajuste de schema, perde-se: `aparelhoLiga`, `aparelhoVibra`, `vidroTraseiro`, `carregamentoCabo`, `carregamentoInducao`, `imaMagsafe`. Os campos do NextJs (`gps`, `cellular`, `sensors`) ficam vazios.
- **Severidade:** P0 — vai falhar a migração de dados.

**G2 — Status enum tem `WAITING_APPROVAL` extra**
- Laravel não tem esse estado. Tudo que está hoje em `IN_DIAGNOSIS` no Laravel vai cair em `IN_DIAGNOSIS` ou `APPROVED` no NextJs.
- **Severidade:** P3 — decisão consciente, documentar.

**G3 — `updateStatus` não bloqueia conclusão para PAID via fluxo direto**
- Laravel força: pagamento de OS deve passar pelo PDV (`registerPayment`) salvo OS sem valor ou de garantia. Admin pode `forcar_paga` apenas para corrigir OS legadas.
- NextJs `updateStatus` permite transição `COMPLETED → PAID` sem checagem extra. `registerPayment` é uma procedure separada que serve o mesmo papel mas não há bloqueio em `updateStatus`.
- **Severidade:** P1 — fluxo de receita pode ser bypass.

**G4 — `registerPayment` não exige caixa aberto**
- Laravel: bloqueia se usuário não tiver `CashSession` aberta (exceto garantia/sem valor). Redireciona para `/caixas`.
- NextJs: tenta usar `cashSession` mas se não existir, apenas pula o `cashMovement` sem erro — não trava o usuário.
- **Severidade:** P1 — perde rastreabilidade de caixa.

**G5 — `updateStatus` para DELIVERED não exige termo de entrega assinado**
- Laravel: bloqueia transição para `entregue` se `termo_entrega_assinado` e `termo_entrega_assinatura_fisica` são false (admin pode forçar).
- NextJs: aceita transição sem validar termo.
- **Severidade:** P1 — entrega sem termo, vulnerabilidade contratual.

**G6 — Notificação WhatsApp ao concluir OS (`notificarConclusao`) ausente**
- Laravel: ao transicionar para `concluida` com flag `notificar_whatsapp`, envia WhatsApp "Aparelho pronto" automaticamente.
- NextJs: `updateStatus` aceita transição para `COMPLETED` mas não tem hook de WhatsApp. Existe procedure `sendTracking` mas é separada.
- **Severidade:** P2 — feature faltando, não bloqueia migração.

**G7 — Limpeza de termo de devolução ao retomar OS ausente**
- Laravel: se `termo_devolucao_enviado=true` e `assinado=false`, ao mudar status (interpretado como retomar), limpa os campos.
- NextJs: campos persistem mesmo após retomada — pode confundir UI futuramente.
- **Severidade:** P2 — bug de UX latente.

**G8 — Sem campo `originalOrderId` resolução ao deletar (FK pendente)**
- Laravel: bloqueia delete se há OS de garantia que referencia esta como `os_original_id`.
- NextJs `delete`: faz soft delete sem checar dependências. OS de garantia ficam órfãs.
- **Severidade:** P2 — integridade referencial em risco.

**G9 — Recompensas (rewards) não integradas em `registerPayment`**
- Laravel: `updateStatus` aceita `recompensa_id` e aplica desconto via `RecompensaService::utilizarDescontoEmOs`.
- NextJs: `registerPayment` não conhece rewards. Router `reward.ts` existe mas integração não está feita.
- **Severidade:** P2 — feature de produto faltando, não bloqueia migração mas decepciona usuário.

### Gaps menores

- **G10:** `numero_os` no Laravel usa `whereYear($criadoEm)` + max(id); no NextJs faz parsing do prefix `OS{year}` — equivalente, paridade OK.
- **G11:** `confirmarRecebimentoLaboratorio` no Laravel não recebe payload; NextJs `receiveFromLab` idem.
- **G12:** Tabela `ServiceOrderItem` não tem `costPrice` com `Decimal(10,3)` — Laravel decidiu por `decimal:2` para items, paridade OK.

### Pontos positivos (não precisam mexer)

- Schema é mais limpo que Laravel (JSONB no checklist em vez de 30 colunas).
- `ALLOWED_TRANSITIONS` está bem modelado e usado no servidor e no detalhe da página.
- Reserva de estoque (`reserveStockForOsItem` / `releaseStockForOsItem`) está em todas as procedures certas (create, addItem, removeItem, cancel).
- Geração de financeiro em `registerPayment` cria `FinancialTransaction` + `Installment` com paridade Laravel.

## Plano de correção

Ordenado por prioridade. Cada item vira commit semântico independente.

| #   | Severidade | Gap | Ação |
|-----|------------|-----|------|
| C1  | P0 | G1 | Atualizar `checklistSchema` para refletir 15 campos do Laravel + adicionar uma vista de migração que cobre os 15 originais. Manter ChecklistData backwards-compatible. |
| C2  | P1 | G3 | Em `updateStatus`, bloquear `PAID` se há valor > 0 e não é garantia, exceto admin com flag `force: true`. |
| C3  | P1 | G4 | Em `registerPayment`, fazer throw se não há `CashSession` aberta (exceto garantia/sem valor). |
| C4  | P1 | G5 | Em `updateStatus` para `DELIVERED`, bloquear se nem `deliveryTermSigned` nem `deliveryTermPhysical` (admin pode bypassar via flag). |
| C5  | P2 | G7 | Em `updateStatus`, se vier de estado com `returnTermSent=true && !returnTermSigned`, limpar campos do termo. |
| C6  | P2 | G8 | Em `delete`, checar se existem OS com `originalOrderId === id`; se sim, lançar `BAD_REQUEST` listando OS. |
| C7  | P2 | G9 | Integrar `reward` em `registerPayment`: input opcional `rewardActionId`, aplicar desconto via `rewardService.useDiscountInOs`. |
| C8  | P2 | G6 | Em `updateStatus → COMPLETED` com `notifyWhatsApp=true`, disparar mensagem via `communication.whatsapp`. |
| C9  | P3 | G2 | Documentar em ADR 0043 a decisão de manter `WAITING_APPROVAL` extra e mapear "Em diagnóstico (Laravel)" → "IN_DIAGNOSIS (NextJs)". |
| C10 | P0 | G1 | Atualizar wizard `step-problem.tsx` para usar os 15 itens novos. |
| C11 | P0 | G1 | Atualizar edit page para a checklist nova. |

Total estimado: ~6h focado, +1h validação (typecheck/test/build/e2e).

## Validação requerida ao fim

- [ ] `pnpm typecheck` verde
- [ ] `pnpm test` verde (sem regressão em service-order.test.ts)
- [ ] `pnpm test:e2e --grep service-order` verde (14 tests)
- [ ] `pnpm test:e2e:lint` verde
- [ ] `pnpm build` verde
- [ ] ADR 0043 criado
- [ ] PROGRESS.md atualizado
