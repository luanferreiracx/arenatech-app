/**
 * Slug do tenant CENTRAL (Arena Tech) — fonte única, sem dependências pesadas.
 *
 * Extraído de `server/api/trpc.ts` (que arrasta a cadeia next-auth) para poder
 * ser importado por código puro/testável (ex.: `talison/runner.ts`, crons) sem
 * puxar o next-auth. O `trpc.ts` re-exporta daqui, então os importadores
 * server-side existentes seguem inalterados.
 */
export const CENTRAL_TENANT_SLUG = "arena-tech";
