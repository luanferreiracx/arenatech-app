import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: {
      // Banco local do docker-compose como PADRÃO, para `pnpm vitest` funcionar
      // sem preâmbulo na máquina de quem desenvolve.
      //
      // `??` e não literal: `test.env` do Vitest SOBRESCREVE o ambiente do
      // processo. Com o valor fixo, o `DATABASE_URL` do CI era descartado, os
      // testes falavam com um banco inexistente no runner e as 101 suítes caíam
      // com erro de conexão do Prisma. Quem define a variável manda; o literal é
      // só o fallback.
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://arenatech:arenatech_local@localhost:5432/arenatech?schema=public",
    },
    include: [
      "__tests__/unit/**/*.{test,spec}.{ts,tsx}",
      "__tests__/integration/**/*.{test,spec}.{ts,tsx}",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
