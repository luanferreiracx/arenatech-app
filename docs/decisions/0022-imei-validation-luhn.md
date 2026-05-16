# ADR 0022 — Validação de IMEI com Algoritmo Luhn

**Status:** aceito
**Data:** 2026-05-16
**Contexto:** Estoque-B (Posição e Movimentações)

## Decisão

Todo IMEI inserido no sistema é validado pelo algoritmo Luhn (mod 10) antes de persistir:
- Exatamente 15 dígitos numéricos
- Dígito verificador (posição 15) validado por Luhn
- IMEI inválido é rejeitado com erro inline no formulário

## Justificativa

- Previne entrada de "lixo" (ex: "123456789012345" que alguém digita rápido)
- IMEI é identificador universal de dispositivos — não cabe aceitar dados inválidos
- Algoritmo simples, O(1), sem dependência externa
- Legacy já faz validação semelhante (EstoqueService verifica IMEI antes de aceitar)

## Implementação

- `src/lib/validators/imei.ts` — função `validateImei(imei: string): boolean`
- Schema Zod com `.refine(validateImei, "IMEI inválido")`
- Componente `imei-input.tsx` valida em tempo real ao digitar (15 chars → auto-valida)
- IMEI duplicado em StockItem ativo (deletedAt IS NULL) do mesmo tenant = erro separado (unique constraint)
