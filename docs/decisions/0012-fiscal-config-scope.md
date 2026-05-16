# ADR 0012: Configuração fiscal limitada a CRUD (não emissão)

## Status
Aceita

## Contexto
O módulo Configurações armazena dados do emitente, certificado digital, séries, ambiente. Poderia também validar conexão com SEFAZ (testar se certificado funciona, se ambiente está acessível).

## Decisão
**Configurações faz apenas CRUD** dos dados fiscais. Emissão, validação de conexão, incremento de número de NF-e e comunicação com SEFAZ/Nuvem Fiscal ficam exclusivamente no módulo Fiscal (já implementado, Fase 9).

## Razão
- Separação de responsabilidades clara
- Configurações é módulo de escrita rara e leitura frequente — não deve ter side effects de rede
- Módulo Fiscal já tem toda a lógica de comunicação implementada
- Testar conexão exigiria importar libs do Fiscal no Configurações (acoplamento circular)

## Consequências
- Tab Fiscal no /settings mostra "último uso" e "expiração do certificado" mas não tem botão "Testar conexão"
- Se tenant configura dados errados, só descobre ao tentar emitir NF-e (módulo Fiscal retorna erro)
