# ADR 0037 — Helper fillField para react-hook-form + Playwright

## Status
Aceita.

## Contexto
page.fill() do Playwright não triggera onChange de react-hook-form register() com shadcn/ui Input. Campo aparece preenchido visualmente mas estado interno fica vazio.

## Decisão
Helper `fillField()` em `__tests__/e2e/helpers/form.helper.ts` usa native setter + dispatchEvent:

```typescript
const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
nativeSetter?.call(el, val);
el.dispatchEvent(new Event("input", { bubbles: true }));
el.dispatchEvent(new Event("change", { bubbles: true }));
```

NUNCA usar `page.fill()` direto em inputs do projeto. Sempre `fillField()`.
