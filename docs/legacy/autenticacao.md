# Legacy: Autenticação e Papéis

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Central (intranet)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /login | LoginController@showLoginForm | login |
| POST | /login | @login | |
| GET-POST | /logout | @logout | logout |
| GET | /alterar-senha | @showChangePasswordForm | password.change |
| POST | /alterar-senha | @changePassword | password.update |

### Tenant (subdomínio)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /login | AuthController@showLoginForm | tenant.login |
| POST | /login | @login | tenant.login.post |
| GET-POST | /logout | @logout | tenant.logout |
| GET | /alterar-senha | @showChangePasswordForm | tenant.password.change |
| POST | /alterar-senha | @changePassword | tenant.password.update |

## 2. Controllers

### LoginController (central)
- `showLoginForm()` — Form de login (CPF + senha).
- `login(Request)` — Autentica via guard 'web'. CPF sanitizado. bcrypt para senha. Se `deve_trocar_senha=true`, redireciona para /alterar-senha.
- `logout(Request)` — Logout + invalidate session.
- `showChangePasswordForm()` — Form de troca de senha obrigatória.
- `changePassword(Request)` — Valida senha atual, atualiza, marca `deve_trocar_senha=false`.

### AuthController (tenant)
- Mesma lógica mas com guard 'tenant'. Autentica no banco do tenant.
- Login por CPF + senha.
- Troca de senha obrigatória para novos usuários.

## 3. Form Requests / Validations

Validação inline:
- `cpf` — required, string
- `password` — required, string
- Troca: `senha_atual` required, `nova_senha` required, min:6, confirmed

## 4. Models

### User
**Tabela:** `usuarios` (banco central)
- id, nome, cpf, email, password, role (admin/gerente/vendedor/tecnico), eh_tecnico (boolean), usa_caixa (boolean), ativo, deve_trocar_senha, remember_token
- Guard: 'web'

### Usuario
**Tabela:** `usuarios` (banco do tenant)
- **Mesmo model/tabela que User**, mas acessado via guard 'tenant' (conexão do tenant).
- id, nome, cpf, email, password, role, eh_tecnico, usa_caixa, ativo, deve_trocar_senha

**Obs:** User e Usuario apontam para a mesma tabela `usuarios`, mas em bancos diferentes (central vs tenant). O guard determina qual banco é usado.

## 5. Services

Nenhum service de autenticação dedicado. Lógica no controller.

## 6. Jobs

Nenhum.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

Nenhuma (autenticação local, sem OAuth externo).

## 9. Migrations

- usuarios (campo em cada banco: central e tenant)

## 10. Views

- resources/views/auth/ — Login, troca de senha
- resources/views/layouts/ — Layout com navbar (nome do user, logout)

## 11. Policies

Sem Policies formais. Roles verificadas via:
- Middleware `role:admin`, `role:gerente,admin`, etc.
- Verificação inline `$user->role !== 'admin'`

### Papéis (roles)
| Role | Descrição |
|------|-----------|
| admin | Acesso total. Pode cancelar, estornar, excluir, configurar. |
| gerente | Acesso a financeiro, relatórios, caixas. Não pode configurar. |
| vendedor | PDV, clientes, OS (suas). Sem financeiro. |
| tecnico | OS atribuídas. Limitado. |

### Flags adicionais
- `eh_tecnico` — Pode ser atribuído como técnico em OS
- `usa_caixa` — Pode operar caixa (abrir/fechar/sangria/suprimento)

## 12. Comandos Artisan customizados

### LimparCpfsDuplicados
- Limpa CPFs duplicados na tabela de usuários.

## 13. Scheduled tasks

Nenhum.

## 14. Dependências cruzadas

- **Guard 'web'** — Autenticação central (intranet)
- **Guard 'tenant'** — Autenticação tenant (subdomínio)
- **Middleware password.change** — Força troca de senha se deve_trocar_senha=true
- **Middleware tenant.verified** — Verifica se tenant tem assinatura ativa (trial não expirado)
- **Middleware role:X** — Verifica role do usuário

## 15. Configurações / .env vars

- Guards configurados em config/auth.php: 'web' e 'tenant'

## 16. Observações técnicas relevantes

1. **Dois guards separados** — 'web' (central) e 'tenant' (subdomínio). Cada um autentica em banco diferente.
2. **Login por CPF** — Não por email. CPF é o identificador principal.
3. **Senha bcrypt $2y$** — Hash PHP bcrypt compatível com bcryptjs do Node.js.
4. **Troca de senha obrigatória** — Novos usuários devem trocar senha no primeiro login.
5. **Middleware tenant.verified** — Verifica assinatura ativa do tenant. Se expirado, redireciona para /assinatura.
6. **Roles simples** — 4 roles fixas, sem RBAC elaborado. Sem tabela de permissões.
7. **User e Usuario são o mesmo model** — Apontam para `usuarios`, diferem pelo guard/conexão.
