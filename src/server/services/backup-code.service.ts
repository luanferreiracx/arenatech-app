import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { hashBackupCode } from "@/lib/auth/two-factor";

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Consome um backup code de 2FA de forma ATÔMICA (uso único à prova de corrida).
 *
 * Antes: lia o array, calculava `remaining` e dava um `update` separado — duas
 * requisições concorrentes com o MESMO backup code ambas liam o array (código
 * presente), ambas passavam e ambas atualizavam → o código de uso único era
 * aceito 2x (replay; podia autorizar 2 saques/2 logins com 1 código).
 *
 * Agora: um único UPDATE condicional no banco remove o hash SÓ se ele ainda
 * estiver no array (`= ANY`). Apenas UMA das requisições concorrentes afeta a
 * linha (count=1); a outra vê count=0 (já consumido) → rejeitada.
 *
 * Retorna `true` se ESTE chamador consumiu o código; `false` se inválido ou já
 * consumido por outra requisição.
 */
export async function consumeBackupCodeAtomic(tx: Tx, userId: string, code: string): Promise<boolean> {
  const hash = hashBackupCode(code.trim());
  const affected = await tx.$executeRaw(
    Prisma.sql`
      UPDATE "users"
      SET "two_factor_backup_codes" = array_remove("two_factor_backup_codes", ${hash})
      WHERE "id" = ${userId}::uuid AND ${hash} = ANY("two_factor_backup_codes")
    `,
  );
  return affected === 1;
}
