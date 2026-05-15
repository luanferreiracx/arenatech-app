# ADR 0005: Modelo unificado PF + PJ para Customer

## Status
Aceita

## Contexto
O sistema Laravel atual (`clientes`) suporta apenas CPF (pessoa física). O campo se chama `cpf` mas a mensagem de validação diz "CPF/CNPJ é obrigatório", indicando intenção de suportar ambos. O controller `consultarCnpj` existe mas busca CNPJ no campo `cpf` da tabela (`Cliente::where('cpf', $cnpjLimpo)`), confirmando que o campo era usado para ambos sem discriminador.

O dono decidiu que o novo sistema deve suportar PF e PJ explicitamente, com campos separados e discriminador de tipo.

## Decisão
Modelo `Customer` com:
- `type: CustomerType (PF | PJ)` — discriminador
- `cpf: String?` — preenchido quando PF
- `cnpj: String?` — preenchido quando PJ
- `tradeName: String?` — nome fantasia, apenas PJ
- `birthDate: DateTime?` — apenas PF

Campos mutuamente exclusivos: PF preenche cpf, PJ preenche cnpj. Ambos armazenados só dígitos.

## Consequências

### Positivas
- Suporte formal a clientes PJ (assistências que atendem empresas)
- Validação clara: CPF com 11 dígitos, CNPJ com 14 dígitos
- Dados fiscais corretos para NF-e (precisa saber se PF ou PJ)

### Negativas
- Divergência do legacy (migração de dados precisa mapear todos como PF)
- UI levemente mais complexa (toggle PF/PJ com campos condicionais)

### Migração
Todos os clientes existentes migram como `type=PF`. Campo `cpf` do legacy vira `cpf` do novo. `cnpj` fica null. `tradeName` fica null.
