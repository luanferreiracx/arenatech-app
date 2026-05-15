# Legacy: Comissões (Regras, Apuração, Prestadores MEI, Sócios)

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

### Comissões (admin)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /comissoes | ComissaoController@index | comissoes.index |

### Prestadores MEI/CLT (admin)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /prestadores | PrestadorComissaoController@index | prestadores.index |
| GET | /prestadores/novo | @create | prestadores.create |
| POST | /prestadores | @store | prestadores.store |
| GET | /prestadores/{id} | @show | prestadores.show |
| PUT | /prestadores/{id}/regras | @atualizarRegras | prestadores.regras.update |
| POST | /prestadores/{id}/apuracoes/fechar | @fecharApuracao | |
| POST | /prestadores/{id}/estornos | @registrarEstorno | |
| DELETE | /prestadores/{id}/estornos/{estorno} | @removerEstorno | |
| POST | /prestadores/{id}/dias-nao-cobertos/toggle | @toggleDiaNaoCoberto | |
| GET | /prestadores/{id}/apuracoes/{ano}/{mes}/pdf | @exportarPdf | |
| GET | /prestadores/{id}/apuracoes/{ano}/{mes}/csv | @exportarCsv | |

### Sócia (acordo interno)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /socia/samya/comissao | SocioComissaoController@samya | socia.samya.comissao |
| PUT | /socia/samya/regras | @atualizarRegras | socia.samya.regras.update |

### Minha Comissão (self-service)
| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| GET | /minha-comissao | MinhaComissaoController@index | minha-comissao.index |
| POST | /minha-comissao/dias-nao-cobertos/toggle | @toggleDiaNaoCoberto | |
| GET | /minha-comissao/{ano}/{mes}/pdf | @exportarPdf | |
| GET | /minha-comissao/{ano}/{mes}/csv | @exportarCsv | |

## 2. Controllers

### ComissaoController
- `index(Request)` — Dashboard de comissões: visão geral por usuário, período selecionável. Usa ComissaoService.

### PrestadorComissaoController
- `index()` — Lista prestadores ativos com último mês apurado.
- `create(Request)` — Form: seleciona usuário, perfil (vendedor/tecnico/ambos), tipo vínculo (MEI/CLT), CNPJ, razão social.
- `store(Request)` — Cria Prestador + PrestadorContrato + PrestadorRegraComissao (regras por faixa progressiva).
- `show(Request, Prestador)` — Ficha completa: dados, contrato vigente, regras, apuração do mês selecionado (com memória de cálculo), estornos, dias não cobertos.
- `atualizarRegras(Request, Prestador)` — Atualiza regras de comissão por categoria (5 categorias × N faixas cada).
- `fecharApuracao(Request, Prestador)` — Fecha apuração do mês. Gera ContaPagar (FinancialTransaction PAYABLE).
- `registrarEstorno(Request, Prestador)` — Cria ComissaoEstorno (desconto, estorno, ajuste).
- `removerEstorno(Prestador, Estorno)` — Remove estorno (apenas se apuração não fechada).
- `toggleDiaNaoCoberto(Request, Prestador)` — Marca/desmarca dia como não coberto (sem trabalho = sem ajuda de custo).
- `exportarPdf/exportarCsv` — Exporta memória de cálculo da apuração.

### SocioComissaoController
- `samya(Request)` — Tela de comissão da sócia (Samya). Acordo interno hardcoded.
- `atualizarRegras(Request)` — Atualiza regras da sócia (SocioRegraComissao).

### MinhaComissaoController
- Self-service: prestador autenticado vê sua própria apuração, marca dias não cobertos, exporta PDF/CSV.

## 3. Form Requests / Validations

Validação inline.

## 4. Models

### Prestador
**Tabela:** `prestadores`
- id, usuario_id (FK→usuarios), perfil (vendedor/tecnico/ambos), tipo_vinculo (MEI/CLT), cnpj, razao_social, ativo
- **Relações:** usuario, contratos (hasMany), apuracoes (hasMany), diasNaoCobertos (hasMany), estornos (hasMany)
- **Scopes:** ativos, tecnicos, vendedores

### PrestadorContrato
**Tabela:** `prestador_contratos`
- id, prestador_id, data_inicio, data_fim, ajuda_custo_diaria_refeicao, ajuda_custo_deslocamento, ajuda_custo_celular, teto_ajuda_custo, observacoes, ativo
- **Relações:** prestador, regras (hasMany PrestadorRegraComissao)

### PrestadorRegraComissao
**Tabela:** `prestador_regras_comissao`
- id, contrato_id, categoria (produto_acessorio/produto_aparelho/servico_at_sem_peca/servico_at_com_peca/intermediacao_at), escopo (proprio/loja), faixa_de, faixa_ate, percentual
- **5 categorias × 2 escopos × N faixas** — Faixas progressivas estilo IR (cada faixa tem limite inferior/superior e percentual).

### ComissaoApuracao
**Tabela:** `comissao_apuracoes`
- id, prestador_id, mes, ano, valor_bruto, valor_estornos, valor_ajuda_custo, valor_liquido, status (aberta/fechada), fechada_em, fechada_por_id, conta_pagar_id
- **Relações:** prestador, estornos

### ComissaoEstorno
**Tabela:** `comissao_estornos`
- id, prestador_id, apuracao_id, tipo (desconto/estorno/ajuste), descricao, valor, referencia_tipo, referencia_id
- **Relações:** apuracao, prestador

### PrestadorDiaNaoCoberto
**Tabela:** `prestador_dias_nao_cobertos`
- id, prestador_id, data, motivo

### SocioRegraComissao
**Tabela:** (modelo separado para regras da sócia)

### Colaborador (legado)
**Arquivo:** app/Models/Colaborador.php
- Modelo antigo de colaborador (antes da unificação com Usuario). Pode estar parcialmente deprecated.

## 5. Services

### ComissaoService
- `calcularComissao(userId, mesReferencia)` — Calcula comissão do mês para um usuário. Busca vendas (PDV) e OS finalizadas no período. Aplica regras do prestador.

### ComissaoEngine
- `apurar(usuarioId, inicio, fim, regras)` — Motor de cálculo: busca transações do período, aplica faixas progressivas, calcula por categoria e escopo. Retorna memória de cálculo detalhada.
- `apurarPrestador(Prestador, inicio, fim)` — Wrapper que carrega regras do contrato vigente e chama apurar().

### ApuracaoComissaoService
- `apurarPrestador(Prestador, ano, mes)` — Cria/atualiza ComissaoApuracao do mês. Calcula: valor_bruto (vendas+OS), estornos, ajuda de custo proporcional (dias efetivos × diárias + celular, limitado pelo teto), valor_liquido.
- `fechar(ComissaoApuracao, usuarioAutor)` — Fecha apuração. Gera ContaPagar automaticamente.

### ApuracaoExportService
- Exporta memória de cálculo em PDF e CSV.

## 6. Jobs

Nenhum.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

Nenhuma.

## 9. Migrations

- `2026_04_22_110000_create_prestadores_tables.php` — prestadores, prestador_contratos, prestador_regras_comissao, comissao_apuracoes, comissao_estornos, prestador_dias_nao_cobertos
- `2026_04_22_120000_add_tributos_comissao.php`
- `2026_04_22_130000_unificar_colaboradores.php` — Migra colaboradores para usuarios
- `2026_04_22_140000_dropar_tecnicos_legado.php`

## 10. Views

- **comissoes/index.blade.php** — Dashboard de comissões
- **prestadores/index.blade.php** — Lista de prestadores
- **prestadores/create.blade.php** — Cadastro de prestador
- **prestadores/show.blade.php** — Ficha completa: dados, regras, apuração com memória de cálculo, estornos, dias não cobertos
- **prestadores/partials/** — Parciais (tabela de faixas, memória cálculo, etc.)
- **prestadores/pdf/** — Templates para exportação PDF
- **socio/comissao/** — Tela de comissão da sócia
- **minha-comissao/index.blade.php** — Self-service do prestador

## 11. Policies

- Comissões/Prestadores: middleware role:admin
- Minha Comissão: qualquer user autenticado (controller valida se é prestador ativo)
- Sócia: middleware role:admin

## 12. Comandos Artisan customizados

Nenhum.

## 13. Scheduled tasks

Nenhum.

## 14. Dependências cruzadas

- **Usa PdvVenda** — Vendas no período para cálculo de comissão
- **Usa OrdemServico** — OS no período para cálculo de comissão
- **Usa Usuario** — Prestador vinculado a Usuario
- **Gera ContaPagar** — Fechamento de apuração gera conta a pagar
- **Usa Produto** — Categorização de comissão por tipo de produto (acessório vs aparelho)

## 15. Configurações / .env vars

Nenhuma.

## 16. Observações técnicas relevantes

1. **Faixas progressivas estilo IR** — Cada faixa tem limite inferior/superior. Receita dentro da faixa é comissionada no percentual da faixa. Similar ao imposto de renda.
2. **5 categorias de comissão** — produto_acessorio, produto_aparelho, servico_at_sem_peca, servico_at_com_peca, intermediacao_at. Cada uma com faixas independentes.
3. **2 escopos** — "proprio" (venda própria do prestador) e "loja" (venda da loja, não do prestador).
4. **Ajuda de custo proporcional** — (diária_refeição + deslocamento) × dias_efetivos + celular. Limitada pelo teto do contrato. Dias não cobertos são descontados.
5. **Fechamento gera ContaPagar** — Ao fechar apuração, cria automaticamente uma conta a pagar no financeiro para o valor líquido.
6. **Sócia hardcoded** — Regras de comissão da sócia (Samya) são um acordo interno específico, não seguem o modelo genérico de prestadores.
7. **Self-service** — Prestador pode ver sua apuração, marcar dias não cobertos e exportar. Não pode fechar apuração.
8. **Unificação colaboradores→usuarios** — Migration 2026_04_22 unificou modelo Colaborador com Usuario. Tecnicos agora são identificados via Prestador com perfil "tecnico".
