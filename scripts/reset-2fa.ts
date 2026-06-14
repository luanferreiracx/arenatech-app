/**
 * reset-2fa.ts
 *
 * Desativa o 2FA de um usuário (limpa segredo, flag, confirmação e backup codes).
 * Recuperação para quem ficou travado no login por um 2FA mal configurado ou cujo
 * segredo não decifra (ex.: rotação do NEXTAUTH_SECRET).
 *
 * Uso (na VPS, dentro do container ou com DATABASE_URL apontando pro prod):
 *   DATABASE_URL="postgresql://..." pnpm tsx scripts/reset-2fa.ts <CPF>
 *
 * Ex.: pnpm tsx scripts/reset-2fa.ts 02205027301
 *
 * Idempotente: se o usuário já não tem 2FA, não faz nada.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rawCpf = process.argv[2];
  if (!rawCpf) {
    console.error("Uso: pnpm tsx scripts/reset-2fa.ts <CPF>");
    process.exit(1);
  }
  const cpf = rawCpf.replace(/\D/g, "");

  const user = await prisma.user.findFirst({
    where: { cpf },
    select: { id: true, name: true, twoFactorEnabled: true },
  });
  if (!user) {
    console.error(`Usuário com CPF ${cpf} não encontrado.`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorConfirmedAt: null,
      twoFactorBackupCodes: [],
    },
  });

  console.log(`2FA resetado para ${user.name} (CPF ${cpf}). Já era ativo? ${user.twoFactorEnabled}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
