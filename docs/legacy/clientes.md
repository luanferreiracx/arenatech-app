# Legacy: Clientes

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Rotas Protegidas (auth + password.change)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /clientes | ClienteController@index | clientes.index |
| GET | /clientes/create | ClienteController@create | clientes.create |
| POST | /clientes | ClienteController@store | clientes.store |
| GET | /clientes/{cliente} | ClienteController@show | clientes.show |
| GET | /clientes/{cliente}/edit | ClienteController@edit | clientes.edit |
| PUT | /clientes/{cliente} | ClienteController@update | clientes.update |
| DELETE | /clientes/{cliente} | ClienteController@destroy | clientes.destroy |
| GET | /clientes/api/consultar-cpf | ClienteController@consultarCpf | api.cpf.consultar |
| GET | /clientes/api/consultar-cnpj | ClienteController@consultarCnpj | api.cnpj.consultar |

### Rotas de Interesses (vinculado a clientes)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /interesses | InteresseController@index | interesses.index |
| POST | /interesses | InteresseController@store | interesses.store |
| POST | /interesses/{id}/status | InteresseController@updateStatus | interesses.update-status |
| POST | /interesses/{id}/interacao | InteresseController@addInteracao | interesses.add-interacao |
| DELETE | /interesses/interacao/{id} | InteresseController@deleteInteracao | interesses.delete-interacao |
| DELETE | /interesses/{id} | InteresseController@destroy | interesses.destroy |
| POST | /interesses/enviar-lote | InteresseController@enviarLote | interesses.enviar-lote |

## 2. Controllers

### ClienteController
**Arquivo:** app/Http/Controllers/ClienteController.php (e Tenant\ClienteController estende)

- `index(Request)` — Lista paginada com busca (nome, CPF, telefone — LIKE com sanitização de caracteres especiais). Filtro ativo/inativo.
- `create()` — Form de criação.
- `store(StoreClienteRequest)` — Cria cliente. Processa CPF (limpa formatação). Verifica duplicidade de CPF.
- `show(Cliente)` — Detalhe com OS, interesses, recompensas.
- `edit(Cliente)` — Form de edição.
- `update(UpdateClienteRequest, Cliente)` — Atualiza cliente.
- `destroy(Cliente)` — Soft delete (ativo=false), não hard delete.
- `consultarCpf(Request, CpfLookupService)` — Consulta CPF na Receita Federal via DirectD API. Retorna JSON com dados cadastrais.
- `consultarCnpj(Request, CnpjLookupService)` — Consulta CNPJ via API. Retorna JSON.

### InteresseController
**Arquivo:** app/Http/Controllers/InteresseController.php

- `index(Request)` — Lista interesses (leads) com filtros: tipo, status, prioridade, busca.
- `store(Request)` — Cria interesse vinculado a cliente. Tipo: aparelho, servico, acessorio.
- `updateStatus(Request, Interesse)` — Muda status do interesse.
- `addInteracao(Request, Interesse)` — Adiciona interação/follow-up ao interesse.
- `deleteInteracao(InteracaoInteresse)` — Remove interação.
- `destroy(Interesse)` — Remove interesse.
- `enviarLote(Request)` — Envia mensagem WhatsApp em lote para múltiplos interesses.

## 3. Form Requests / Validations

### StoreClienteRequest
**Arquivo:** app/Http/Requests/Cliente/StoreClienteRequest.php
- `cpf` — nullable, string, max:20 (aceita formatado)
- `nome_completo` — required, string, max:255
- `data_nascimento` — nullable, date
- `celular_whatsapp` — nullable, string, max:20
- `celular_alternativo` — nullable, string, max:20
- `email` — nullable, email, max:255
- `cep` — nullable, string, max:10
- `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `estado` — nullable, string
- `observacoes` — nullable, string

### UpdateClienteRequest
Similar ao Store.

## 4. Models

### Cliente
**Arquivo:** app/Models/Cliente.php
**Tabela:** `clientes`

| Coluna | Tipo | Nullable | Observação |
|--------|------|----------|------------|
| id | bigint PK | não | |
| cpf | string | sim | aceita formatado ou limpo |
| nome_completo | string | não | |
| data_nascimento | date | sim | |
| celular_whatsapp | string | sim | telefone principal |
| celular_alternativo | string | sim | |
| email | string | sim | |
| cep | string | sim | |
| logradouro | string | sim | |
| numero | string | sim | |
| complemento | string | sim | |
| bairro | string | sim | |
| cidade | string | sim | |
| estado | string | sim | |
| observacoes | text | sim | |
| ativo | boolean | não | default true, soft delete manual |
| usuario_cadastro_id | FK→users | sim | |
| criado_em / atualizado_em | datetime | sim | timestamps customizados |

**Relações:**
- `ordensServico()` hasMany OrdemServico
- `interesses()` hasMany Interesse
- `recompensaSaldo()` hasOne RecompensaSaldo
- `recompensasAcoes()` hasMany RecompensaAcao
- `recompensasMovimentacoes()` hasMany RecompensaMovimentacao

**Scopes:** ativos, busca (nome/CPF/telefone com sanitização)
**Accessors:** nome (alias), telefone (alias), dataNascimentoFormatada, idade, cpfFormatado, telefoneFormatado, enderecoCompleto, saldoCashbackDisponivel, recompensasAtivas
**SoftDeletes?** Não (usa campo `ativo` boolean)
**Timestamps?** Sim (criado_em/atualizado_em)

### Interesse
**Arquivo:** app/Models/Interesse.php
**Tabela:** `interesses`

- cliente_id, tipo (aparelho/servico/acessorio), descricao, modelo_interesse, status, prioridade, data_follow_up, observacoes

### InteracaoInteresse
**Arquivo:** app/Models/InteracaoInteresse.php
**Tabela:** `interacoes_interesses`

- interesse_id, tipo (nota/ligacao/whatsapp/visita), descricao, usuario_id

## 5. Services

### CpfLookupService
**Arquivo:** app/Services/CpfLookupService.php
- Consulta CPF na Receita Federal via DirectD API (api.directd.com.br).
- Token via env var `DIRECTD_TOKEN`.
- Retorna: nome, data nascimento, situação cadastral.

### CnpjLookupService
**Arquivo:** app/Services/CnpjLookupService.php
- Consulta CNPJ via API (possivelmente BrasilAPI ou DirectD).
- Retorna: razão social, nome fantasia, endereço, situação.

## 6. Jobs

Nenhum.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

### DirectD API (Receita Federal)
- **Endpoint:** api.directd.com.br
- **Auth:** Bearer token via `DIRECTD_TOKEN`
- **Uso:** Consulta CPF e CNPJ para preenchimento automático de dados cadastrais

## 9. Migrations

- Criação da tabela clientes (inicial)
- Criação de interesses, interacoes_interesses
- Adição de campos (celular_alternativo, email, endereço, etc.)

## 10. Views

- **index.blade.php** — Lista paginada com busca, badges ativo/inativo
- **create.blade.php** — Form: nome, CPF (com botão consultar), data nascimento, WhatsApp, alternativo, email, endereço (com CEP auto-preenche via ViaCEP), observações
- **edit.blade.php** — Similar ao create
- **show.blade.php** — Detalhe: dados pessoais, endereço, tabs (OS do cliente, interesses/leads, recompensas/cashback)

## 11. Policies

Sem Policy formal. Todos os usuários autenticados podem CRUD clientes.

## 12. Comandos Artisan customizados

### AtualizarClientesReceitaCommand
**Arquivo:** app/Console/Commands/AtualizarClientesReceitaCommand.php
- Atualiza dados de clientes consultando CPF na Receita Federal em lote.

## 13. Scheduled tasks

Nenhum schedule identificado para clientes.

## 14. Dependências cruzadas

- **Usado por OrdemServico** — cliente_id FK
- **Usado por PdvVenda** — cliente_id FK
- **Usado por Interesse** — cliente_id FK
- **Usado por Recompensas** — RecompensaSaldo, RecompensaAcao, RecompensaMovimentacao
- **Usa Service CpfLookupService/CnpjLookupService** — consulta Receita Federal

## 15. Configurações / .env vars

- `DIRECTD_TOKEN` — Token da API DirectD para consulta CPF/CNPJ

## 16. Observações técnicas relevantes

1. **Sem CNPJ no model** — O model Cliente não tem campo CNPJ. Apenas CPF. O consultarCnpj no controller aparenta ser usado para preencher dados de fornecedor, não de cliente.
2. **CPF sem validação de dígito verificador** — O Laravel aceita qualquer string como CPF. Sem validação algorítmica.
3. **Soft delete manual** — Usa campo `ativo` boolean, não SoftDeletes do Eloquent.
4. **Busca com sanitização** — Remove formatação (pontos, traços) para buscar CPF e telefone tanto formatado quanto limpo.
5. **Interesses = leads de venda** — Sistema de CRM básico: tipo de interesse, status de follow-up, interações, envio em lote por WhatsApp.
6. **Recompensas vinculadas** — Cliente tem saldo de cashback e ações de recompensa (stories/reels). Relacionamento direto.
