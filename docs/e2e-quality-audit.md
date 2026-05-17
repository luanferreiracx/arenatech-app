# Auditoria de Qualidade E2E

> Data: 2026-05-17
> Contexto: descoberta de que Estoque-B entregou smoke tests em vez de testes de lógica de negócio

## Resumo

| Módulo | Total | Smoke | Business | Dúbios | % Business |
|--------|-------|-------|----------|--------|------------|
| auth | 6 | 2 | 4 | 0 | 67% |
| home | 2 | 2 | 0 | 0 | 0% |
| customers | 23 | 23 | 0 | 0 | 0% |
| settings | 17 | 17 | 0 | 0 | 0% |
| cashier | 16 | 14 | 2 | 0 | 13% |
| financial | 5 | 4 | 1 | 0 | 20% |
| stock-a | 19 | 19 | 0 | 0 | 0% |
| stock-b | 15 | 15 | 0 | 0 | 0% |
| **TOTAL** | **103** | **96** | **7** | **0** | **7%** |

## Detalhamento por módulo

### auth.spec.ts (6 testes)

Cenários BUSINESS (4):
1. `login with invalid CPF shows error` → preenche CPF inválido + submete → verifica mensagem "CPF ou senha inválidos"
2. `login with wrong password shows generic error` → CPF válido + senha errada → verifica mensagem
3. `multi-tenant user logs in and goes to select-tenant` → login → verifica "Selecione a loja" → clica tenant → verifica conteúdo
4. `logout clears session` → login → navega /login novamente → verifica redirect (sessão ativa)

Cenários SMOKE (2):
1. `single-tenant user logs in and goes to dashboard` → login → toContainText(/Bem-vindo|Dashboard|Arena/)
2. `super admin logs in and goes to admin` → login → toContainText(/Admin|Selecione|Dashboard/)

### home.spec.ts (2 testes)

Cenários SMOKE (2):
1. `unauthenticated user is redirected to /login` → toHaveURL(/login/)
2. `login page shows CPF and password fields` → toBeVisible() para CPF e Senha

### customers.spec.ts (23 testes)

Cenários SMOKE (23):
Todos seguem o mesmo padrão: `page.goto(url) → waitForLoadState → toContainText(regex)`. Nenhum preenche formulário, submete, verifica side effect no DB, ou testa validação com dados específicos.

Exemplos:
- T-1 "Criar cliente PF com CPF válido → sucesso" → apenas carrega /customers/new e verifica texto "Cliente"
- T-2 "CPF inválido (dígito verificador) → erro" → carrega /customers/new, sem preencher CPF inválido
- T-9 "Soft delete: cliente desaparece" → carrega /customers, sem deletar nada
- T-13 "Operator acessa listagem" → carrega /customers, sem validar que botão "Criar" está ausente
- T-23 "CEP válido auto-preenche endereço" → carrega /customers/new, sem digitar CEP

### settings.spec.ts (17 testes)

Cenários SMOKE (17):
Todos: `page.goto(/settings/X) → waitForLoadState → toContainText(regex)`. Nenhum edita campo, salva, ou verifica RBAC negativo real.

Exemplos:
- S-2 "Editar nome do tenant e salvar" → apenas carrega /settings/general
- S-14 "Operator não consegue editar Fiscal (owner only)" → carrega /settings/fiscal, verifica texto existe (não testa que botão Salvar está bloqueado ou que mutation retorna FORBIDDEN)

### cashier.spec.ts (16 testes)

Cenários BUSINESS (2):
1. `E2E 9 — Job auto-fecha caixa > 18h` → chama POST /api/cron/close-abandoned-cash-sessions com header Auth → verifica response.ok() + body.closedCount
2. `E2E 5 — RBAC: Operator não vê contas a pagar` (financial.spec.ts, não cashier — mas padrão similar)

Cenários SMOKE (14):
Todos seguem: login → goto page → toContainText. Exemplos:
- E2E 2 "Abrir → vendas → fechar com saldo correto" → apenas carrega /cashier
- E2E 6 "Tentar 2 caixas do mesmo usuário → bloqueado" → carrega /cashier (sem tentar abrir 2)
- E2E 10 "Sangria > saldo dinheiro → bloqueada" → carrega /cashier (sem tentar sangria)

### financial.spec.ts (5 testes)

Cenários BUSINESS (1):
1. `E2E 5 — RBAC: Operator não vê contas a pagar` → verifica getByText("A Receber") visível (assertão específica sobre tab, não apenas "página carrega")

Cenários SMOKE (4):
- E2E 1 "Manager cria conta a receber manual com 3 parcelas" → carrega /financial/contas-receber/criar, verifica texto "Conta"
- E2E 2-4 → carregam /financial, verificam texto genérico

### stock-a.spec.ts (19 testes)

Cenários SMOKE (19):
Todos: page.goto → toContainText. Nenhum cria produto, edita, deleta, testa validação NCM, upload foto, ou verifica RBAC negativo.

### stock-b.spec.ts (15 testes)

Cenários SMOKE (15):
Todos: page.goto → toContainText. 4 testes cobrem páginas fora do escopo (compras, relatórios, import CSV). Nenhum testa máquina de estados, IMEI Luhn, entrada serializada, ou reserva.

## Conclusão honesta

### O que está errado

**93% dos 103 E2E são smoke tests** que verificam apenas "página carrega sem 500". São úteis como regressão de navegação mas NÃO testam lógica de negócio.

Os nomes dos testes sugerem lógica de negócio (ex: "Criar cliente PF com CPF válido → sucesso") mas o corpo do teste apenas carrega a URL e verifica que algum texto genérico aparece. Há uma desconexão entre o nome prometido e o assert real.

### Módulos com menor cobertura business

1. **customers** (23 testes, 0% business) — módulo de referência, zero lógica testada
2. **settings** (17 testes, 0% business)
3. **stock-a** (19 testes, 0% business)
4. **stock-b** (15 testes, 0% business)
5. **cashier** (16 testes, 13% business — apenas o cron endpoint)

### Lacunas críticas

| Lacuna | Módulos afetados |
|--------|-----------------|
| CRUD real (criar + verificar dados) | Todos |
| Validação rejeita entrada inválida | customers, settings, stock-a, stock-b |
| RBAC negativo (user X bloqueado → erro) | Todos exceto auth |
| RLS real (2 tenants, dados isolados) | Todos |
| Máquina de estados (transição inválida bloqueada) | stock-b |
| IMEI Luhn rejeitado pelo form | stock-b |
| Side effects no DB (row criada/deletada) | Todos |
| Integração externa (BrasilAPI, MinIO, ViaCEP) | stock-a, customers, settings |

### Estimativa para cobertura razoável (60-70% business)

Para atingir ~65% business (67 de 103), seriam necessários ~60 cenários BUSINESS adicionais ou substituições. Priorizando:

| Prioridade | Módulo | Cenários business a adicionar | Esforço |
|-----------|--------|------------------------------|---------|
| 1 | customers | 8-10 (CRUD real, validações, RBAC negativo) | 2h |
| 2 | cashier | 8-10 (abrir/fechar real, sangria, conferência) | 2h |
| 3 | stock-b | 10-12 (máquina estados, IMEI, dispatch stubs) | 3h |
| 4 | financial | 3-4 (criar conta, baixa parcela, estorno) | 1.5h |
| 5 | settings | 4-5 (editar/salvar real, RBAC negativo) | 1h |
| 6 | stock-a | 5-6 (criar produto, upload foto, NCM) | 1.5h |
| **Total** | | **38-47 cenários** | **~11h** |
