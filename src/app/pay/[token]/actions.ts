"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { extractSourceIp } from "@/lib/webhooks/replay-guard";
import {
  generatePublicPix as generatePublicPixService,
  getPublicPixStatus as getPublicPixStatusService,
  type GeneratePublicPixResult,
  type PublicPixStatus,
} from "@/server/services/pay-public.service";

const generateSchema = z.object({
  token: z.string().min(8).max(64),
  taxId: z.string().min(11).max(20),
  amountCents: z.number().int().positive().nullable(),
  ownershipConfirmed: z.boolean(),
});

async function clientIp(): Promise<string> {
  return extractSourceIp(await headers()) ?? "anon";
}

/** Gera o QR de pagamento publico. Rate-limit por IP (anti-spam de QR). */
export async function generatePublicPixAction(
  input: z.infer<typeof generateSchema>,
): Promise<GeneratePublicPixResult> {
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const rl = await rateLimit({
    key: `pay-public-generate:${await clientIp()}`,
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.success) {
    return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }

  return generatePublicPixService(parsed.data);
}

/** Consulta o status do pagamento (polling). Rate-limit generoso por IP. */
export async function getPublicPixStatusAction(token: string): Promise<PublicPixStatus> {
  const rl = await rateLimit({
    key: `pay-public-status:${await clientIp()}`,
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (!rl.success) return "pending";
  return getPublicPixStatusService(token);
}
