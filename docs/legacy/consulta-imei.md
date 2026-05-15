# Legacy: Consulta IMEI

> Inventário detalhado do módulo no sistema Laravel atual.
> Base para futura SPEC rigorosa.

## 1. Rotas

| Método | URI | Controller@Action | Nome |
|--------|-----|-------------------|------|
| POST | /consulta/imei | ConsultaController@consultarIMEI | consulta.imei |
| POST | /consulta/nfe | ConsultaController@validarNFe | consulta.nfe |
| GET | /consulta/resumo | @resumoConsultas | consulta.resumo (tenant only) |
| GET | /consulta/historico | @historicoConsultas | consulta.historico (tenant only) |

## 2. Controllers

### ConsultaController
**Arquivo:** app/Http/Controllers/ConsultaController.php (e Tenant\ConsultaController)

- `consultarIMEI(Request)` — Recebe IMEI, consulta via IMEICheckService. Decrementa cota mensal do tenant (TenantConsultaImei). Retorna JSON com dados do dispositivo (modelo, marca, fabricante, status, garantia, segurança).
- `validarNFe(Request)` — Valida chave NF-e via NFEService.
- `resumoConsultas()` — Resumo de consultas do tenant (tenant only): total do mês, cota restante.
- `historicoConsultas()` — Histórico de consultas (tenant only): lista com data, IMEI, resultado.

## 3. Form Requests / Validations

Validação inline: IMEI required, string, min:15, max:15.

## 4. Models

### TenantConsultaImei
**Tabela:** `tenant_consultas_imei`
- id, identificador (IMEI consultado), resultado (JSON com dados do dispositivo), usuario_id, criado_em
- **Quota mensal:** Controlada por configuração do tenant (cota_imei_mensal).

## 5. Services

### IMEICheckService
**Arquivo:** app/Services/IMEICheckService.php
- `consultarDispositivo(identificador)` — Consulta IMEI via API externa. Retorna: modelo, marca, fabricante, is_valid, blacklist_status, warranty, carrier_info.
- `obterSaldo()` — Consulta saldo de créditos na API.
- **NOTA:** API key estava hardcoded no código (lacuna de segurança identificada).

## 6. Jobs

Nenhum.

## 7. Events / Listeners

Nenhum.

## 8. Integrações externas

### API IMEI Check
- **Endpoint:** Configurável via env var
- **Auth:** API Key (IMEI_API_KEY)
- **Uso:** Consulta dados de dispositivo por IMEI/serial

## 9. Migrations

- tenant_consultas_imei

## 10. Views

- resources/views dentro da tela de OS (consulta inline)
- Tenant: tela dedicada /consulta com resumo e histórico

## 11. Policies

Sem policies.

## 12. Comandos Artisan customizados

Nenhum.

## 13. Scheduled tasks

### ResetConsultasMensais (Job)
**Arquivo:** app/Jobs/ResetConsultasMensais.php
- Reseta contadores de consultas mensais de todos os tenants.

## 14. Dependências cruzadas

- **Usado pelo Estoque** — buscarImei usa verificação IMEI no estoque
- **Configuração tenant** — Cota mensal configurável

## 15. Configurações / .env vars

- `IMEI_API_URL` — URL da API IMEI
- `IMEI_API_KEY` — Chave da API

## 16. Observações técnicas relevantes

1. **API key hardcoded** — Já identificada como lacuna. Migrado para env var no Next.js.
2. **Quota mensal por tenant** — Cada tenant tem cota de consultas IMEI. Controlada por configuração.
3. **Validação NF-e no mesmo controller** — consultarIMEI e validarNFe coexistem no ConsultaController.
