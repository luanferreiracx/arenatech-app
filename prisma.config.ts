import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Load .env files in development (dotenv may not exist in production standalone image)
try {
  const { config } = require("dotenv");
  config({ path: path.join(__dirname, ".env.local") });
  config({ path: path.join(__dirname, ".env") });
} catch {
  // dotenv not available in production — DATABASE_URL comes from environment
}

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema"),
  migrations: {
    path: path.join(__dirname, "prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
