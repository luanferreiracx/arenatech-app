# ADR 0009: Integração ViaCEP em formulários de endereço

## Status
Aceita

## Contexto
O dono inicialmente decidiu que ViaCEP era anti-escopo no módulo Clientes (realidade#7 no SPEC v1.0). Decisão revertida: ViaCEP é desejado em todos os formulários de endereço do sistema para usabilidade real dos operadores.

O componente `cep-input.tsx` já existia desde a Fase 4 com integração ViaCEP embutida, mas não era usado no form de clientes (que usava `<Input>` simples para CEP).

## Decisão
**Incluir ViaCEP em todos os formulários que coletam endereço.** O padrão é:
1. Componente `CepInput` com callback `onAddressFound`
2. Debounce de 500ms após digitação de 8 dígitos
3. Degradação graciosa em falha (mensagem inline, form editável)
4. Lógica de fetch extraída para `src/lib/integrations/viacep.ts` (reusável)

## Alternativas consideradas

### A) Sem ViaCEP (descartada)
- Operador digita CEP + endereço manualmente
- Erro humano frequente em bairro/cidade
- Descartada por decisão revisada do dono

### B) Google Places API (descartada)
- Mais completa (autocomplete por endereço textual)
- Custo por request ($2.83/1000 requests)
- Overkill para o caso de uso (CEP brasileiro → endereço)
- Descartada por custo

### C) ViaCEP (aceita)
- Gratuita, sem limites documentados
- Cobertura de 100% dos CEPs brasileiros
- Sem SLA (pode cair sem aviso)
- API simples (GET retorna JSON)

## Trade-offs aceitos
- **Dependência de serviço externo sem SLA:** mitigado por degradação graciosa (form funciona sem ViaCEP)
- **Latência:** fetch externo adiciona 200-500ms ao fluxo; mitigado por debounce (não bloqueia digitação)
- **CEPs novos:** ViaCEP pode não ter CEPs recém-criados; mitigado por campos editáveis após auto-fill

## Consequências
- Todo formulário de endereço no sistema usa `CepInput` com `onAddressFound`
- Padrão documentado em `docs/PATTERNS.md` seção "Formulários de endereço"
- Módulos que já usam `CepInput` (stock/suppliers, fiscal, settings/general) já estão alinhados
- Módulo Clientes atualizado retroativamente
