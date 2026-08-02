/**
 * Configuração global da plataforma (ADR 0061). Linha única, só o superadmin
 * edita.
 *
 * Hoje guarda um número: quantos dias de teste grátis um tenant novo ganha. O
 * dono pediu controle do prazo "geral e de cada tenant" — o geral é isto; o de
 * cada tenant é empurrar o `currentPeriodEnd` da assinatura em teste, que não
 * precisa de campo novo.
 *
 * Não virou variável de ambiente porque o pedido era controle PELO PAINEL, e
 * env exige deploy para mudar um número.
 */
import type { Prisma } from "@prisma/client";

/** Id fixo da linha única (o banco garante com CHECK; ver migration). */
export const PLATFORM_SETTINGS_ID = "singleton";

/** Dias de teste quando a linha ainda não existe (banco recém-migrado). */
export const DEFAULT_TRIAL_DAYS = 7;

export type PlatformSettings = { trialDays: number };

/**
 * Lê a configuração, criando a linha no primeiro acesso.
 *
 * O upsert evita o caso em que a migration rodou mas o INSERT inicial não pegou
 * (restore parcial, banco criado por outro caminho): sem ele, um `findUnique`
 * devolveria null e o trial silenciosamente viraria zero dia.
 */
export async function getPlatformSettings(
  tx: Prisma.TransactionClient,
): Promise<PlatformSettings> {
  const row = await tx.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, trialDays: DEFAULT_TRIAL_DAYS },
    update: {},
    select: { trialDays: true },
  });
  return { trialDays: row.trialDays };
}

export async function updatePlatformSettings(
  tx: Prisma.TransactionClient,
  input: { trialDays: number; updatedById: string },
): Promise<PlatformSettings> {
  const row = await tx.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: {
      id: PLATFORM_SETTINGS_ID,
      trialDays: input.trialDays,
      updatedById: input.updatedById,
    },
    update: { trialDays: input.trialDays, updatedById: input.updatedById },
    select: { trialDays: true },
  });
  return { trialDays: row.trialDays };
}

/** Fim do teste a partir de agora. Dia é 24h corridas — sem aritmética de fuso. */
export function trialEndsAt(now: Date, trialDays: number): Date {
  return new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
}
