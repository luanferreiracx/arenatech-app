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

/**
 * Marca um passo TOTP como usado de forma ATÔMICA (anti-replay — P2-1).
 *
 * Aceita o código SÓ se o `counter` for ESTRITAMENTE MAIOR que o último já
 * aceito (`two_factor_last_used_counter`). Assim o MESMO código de 6 dígitos
 * (mesmo counter) não autoriza duas operações dentro da janela (~30-90s), e não
 * dá pra "voltar" pra um código mais antigo. Atômico: duas requisições
 * concorrentes com o mesmo código → só uma afeta a linha (count=1).
 *
 * Retorna `true` se ESTE chamador "venceu" (counter novo aceito); `false` se for
 * replay (counter <= último usado).
 */
export async function markTotpCounterUsedAtomic(tx: Tx, userId: string, counter: number): Promise<boolean> {
  const affected = await tx.$executeRaw(
    Prisma.sql`
      UPDATE "users"
      SET "two_factor_last_used_counter" = ${counter}
      WHERE "id" = ${userId}::uuid
        AND ("two_factor_last_used_counter" IS NULL OR "two_factor_last_used_counter" < ${counter})
    `,
  );
  return affected === 1;
}
