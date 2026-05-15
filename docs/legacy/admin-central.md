# Legacy: Admin Central / SaaS

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Tenants
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /admin/tenants | TenantController@index | admin.tenants.index |
| GET | /admin/tenants/create | @create | admin.tenants.create |
| POST | /admin/tenants | @store | admin.tenants.store |
| GET | /admin/tenants/{tenant} | @show | admin.tenants.show |
| GET | /admin/tenants/{tenant}/edit | @edit | admin.tenants.edit |
| PUT | /admin/tenants/{tenant} | @update | admin.tenants.update |
| DELETE | /admin/tenants/{tenant} | @destroy | admin.tenants.destroy |
| POST | /admin/tenants/{tenant}/suspend | @suspend | admin.tenants.suspend |
| POST | /admin/tenants/{tenant}/reactivate | @reactivate | |
| POST | /admin/tenants/{tenant}/resetar-senha | @resetarSenha | |
| POST | /admin/tenants/gerar-link-precadastro | @gerarLinkPrecadastro | |
| POST | /admin/tenants/{tenant}/cancelar-assinatura | @cancelarAssinatura | |
| POST | /admin/tenants/{tenant}/mudar-plano | @mudarPlano | |
| POST | /admin/tenants/{tenant}/criar-assinatura | @criarAssinatura | |
| DELETE | /admin/tenants/{tenant}/permanent | @destroyPermanent | |

### Planos
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| CRUD | /admin/planos/* | PlanoController | |
| POST | /admin/planos/{plano}/toggle-status | @toggleStatus | |
| POST | /admin/planos/reorder | @reorder | |

### Addons
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| CRUD | /admin/addons/* | AddonController | |
| POST | /admin/addons/{addon}/toggle-status | @toggleStatus | |
| POST | /admin/addons/reorder | @reorder | |
| POST | /admin/addons/adicionar-tenant | @adicionarParaTenant | |

### Estornos
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /admin/estornos | EstornoController@index | admin.estornos.index |
| GET | /admin/estornos/{id} | @show | |
| POST | /admin/estornos/{id}/processar | @processar | |
| POST | /admin/estornos/{id}/cancelar | @cancelar | |

### Pré-cadastros (admin)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /admin/precadastros | AdminPrecadastroController@index | admin.precadastros.index |
| GET | /admin/precadastros/{id} | @show | |
| POST | /admin/precadastros/{id}/aprovar | @aprovar | |
| POST | /admin/precadastros/{id}/rejeitar | @rejeitar | |
| DELETE | /admin/precadastros/{id} | @destroy | |
| POST | /admin/precadastros/gerar-link | @gerarLink | |
| POST | /admin/precadastros/{id}/reenviar-link | @reenviarLink | |

### Pré-cadastro Público
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /cadastro/planos | PrecadastroController@planos | precadastro.planos |
| POST | /cadastro/iniciar | @iniciar | precadastro.iniciar |
| GET | /cadastro/{token} | @show | precadastro.show |
| POST | /cadastro/{token} | @store | precadastro.store |
| GET | /cadastro/plano/personalizado | @personalizado | |
| POST | /cadastro/plano/personalizado/contato | @enviarContato | |

## 2. Controllers

### TenantController (admin)
- `index(Request)` — Lista tenants com filtros: status, plano, busca.
- `show(Tenant)` — Detalhe: dados, assinatura, cobrança, usuários, addons, métricas.
- `create/store` — Criar tenant manualmente.
- `edit/update` — Editar tenant.
- `suspend/reactivate` — Suspender/reativar tenant.
- `destroy/destroyPermanent` — Soft delete / hard delete.
- `resetarSenha(Request, Tenant)` — Reseta senha do admin do tenant.
- `gerarLinkPrecadastro(Request)` — Gera link único para pré-cadastro.
- `cancelarAssinatura/mudarPlano/criarAssinatura` — Gestão de assinatura.

### PlanoController (admin)
- CRUD de planos SaaS: nome, preço, limites (OS/mês, vendas/mês, consultas IMEI), features.
- toggleStatus: ativa/desativa plano.
- reorder: reordena planos (drag & drop).

### AddonController (admin)
- CRUD de addons (pacotes extras): consultas IMEI adicionais, etc.
- adicionarParaTenant: atribui addon a um tenant específico.

### EstornoController (admin)
- Lista/processa/cancela pedidos de estorno de tenants (DePix).

### AdminPrecadastroController
- `aprovar(Request, Precadastro)` — Aprova pré-cadastro: cria Tenant (stancl/tenancy), roda migrations do tenant, cria usuário admin do tenant, cria assinatura inicial.
- `rejeitar(Request, Precadastro)` — Rejeita com motivo.

### PrecadastroController (público)
- `planos()` — Exibe planos disponíveis.
- `iniciar(Request)` — Seleciona plano, gera token, redireciona para formulário.
- `show(token)` — Formulário de pré-cadastro: dados da empresa, responsável, contato.
- `store(Request, token)` — Submete pré-cadastro.
- `personalizado()` — Página para plano personalizado (contato comercial).

## 3. Form Requests / Validations

Validação inline.

## 4. Models

### Tenant (stancl/tenancy)
**Tabela:** `tenants` (banco central)
- id (string UUID), nome, dominio, status (active/suspended/trial), data_criacao, dados_json

### TenantAssinatura
**Tabela:** `tenant_assinaturas`
- id, tenant_id, plano_id, status, data_inicio, data_fim, valor_mensal, metodo_pagamento

### TenantCobranca
**Tabela:** `tenant_cobrancas`
- id, tenant_id, assinatura_id, valor, status, data_vencimento, data_pagamento, referencia_pix

### Plano
**Tabela:** `planos`
- id, nome, descricao, preco_mensal, preco_anual, limites_json (max_os, max_vendas, max_imei, max_usuarios), features_json, ativo, ordem

### Precadastro
**Tabela:** `precadastros`
- id, token, plano_id, empresa_nome, cnpj, responsavel_nome, responsavel_cpf, telefone, email, endereco, status (pendente/aprovado/rejeitado), motivo_rejeicao, tenant_id (preenchido após aprovação)

### AddonConsulta
**Tabela:** `addons_consultas`
- id, nome, descricao, tipo, quantidade, preco, ativo, ordem

### TenantAddonCompra
**Tabela:** `tenant_addon_compras`
- id, tenant_id, addon_id, quantidade, valor, data_compra, data_validade

### TenantEstorno
**Tabela:** `tenant_estornos`
- id, tenant_id, valor, motivo, status, processado_por_id

## 5. Services

### TenantService
**Arquivo:** app/Services/TenantService.php
- Gestão de tenants: criação, configuração inicial, migrations.

## 6. Jobs

### ExpirarAddonsVencidos
- Expira addons comprados que passaram da data de validade.

## 7. Events / Listeners

### SeedTenantDatabase (Listener)
**Arquivo:** app/Listeners/SeedTenantDatabase.php
- Escuta evento de criação de tenant (stancl/tenancy). Roda seeds iniciais no banco do novo tenant.

## 8. Integrações externas

### DePix/PixPay
- Geração de PIX para cobrança de assinaturas e addons.

## 9. Migrations

- tenants (stancl/tenancy), tenant_assinaturas, tenant_cobrancas, planos, precadastros, addons_consultas, tenant_addon_compras, tenant_estornos

## 10. Views

- resources/views/admin/ — Tenants, planos, addons, estornos, pré-cadastros
- resources/views/precadastro/ — Páginas públicas de pré-cadastro
- resources/views/tenant/ — Assinatura do lado tenant

## 11. Policies

Admin apenas (todas as rotas sob /admin/).

## 12. Comandos Artisan customizados

Nenhum específico.

## 13. Scheduled tasks

- ExpirarAddonsVencidos — periódico

## 14. Dependências cruzadas

- **stancl/tenancy** — Gestão de multi-tenancy (banco separado por tenant)
- **Usa Plano** — Tenant tem plano vinculado
- **Usa DePix** — Cobrança de assinaturas
- **SeedTenantDatabase** — Popula banco do tenant ao criar

## 15. Configurações / .env vars

- `CENTRAL_DOMAIN` — Domínio central (intranet.arenatechpi.com.br)
- Credenciais DePix para cobranças

## 16. Observações técnicas relevantes

1. **stancl/tenancy com banco separado** — Cada tenant tem seu próprio banco MySQL. Diferente do Next.js que usa RLS em PostgreSQL.
2. **Aprovação de pré-cadastro cria tenant** — Fluxo: form público → pré-cadastro pendente → admin aprova → cria tenant + banco + seeds + usuário admin.
3. **Assinatura DePix** — Controller de assinatura (AssinaturaController) foi desativado (Asaas removido, DePix em desenvolvimento).
4. **Addons = pacotes extras** — Principalmente consultas IMEI adicionais. Compra via PIX DePix.
5. **Estornos = pedidos de reembolso** — Tenants solicitam estorno, admin processa.
