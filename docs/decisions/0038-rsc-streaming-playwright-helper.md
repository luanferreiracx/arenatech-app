# ADR 0038 — Helper gotoAndWait para RSC streaming + Playwright

## Status
Aceita.

## Contexto
Next.js 16 + Turbopack faz RSC streaming on-demand. Layout (sidebar) renderiza primeiro, {children} fica pendente. waitForLoadState("networkidle") não basta — RSC mantém connection aberta.

## Decisão
Helper `gotoAndWait()` em `__tests__/e2e/helpers/navigation.helper.ts`:

```typescript
await page.goto(url);
await page.waitForSelector("main h1, main form, main table", { timeout: 30000 });
```

Espera até que conteúdo apareça dentro de `<main>`, garantindo que RSC streaming completou.

NUNCA usar `page.goto()` + `waitForLoadState("networkidle")` em business tests. Sempre `gotoAndWait()`.

## Descoberta adicional
`<nextjs-portal>` (dev overlay) intercepta pointer events. Usar `{ force: true }` em clicks ou `dispatchEvent("click")` para Radix UI components.
