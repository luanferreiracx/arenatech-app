/**
 * Allowlist de carteiras BYOW (self-custody) do DePix — leitura/escrita.
 *
 * A API de parceiro só pode receber DePix num endereço que ESTEJA nesta lista
 * (ver `assertAddressAllowed`). Cadastrar exige confirmação humana forte
 * (senha + 2FA + email + WhatsApp), feita no router do painel; este service
 * grava/lê sob RLS do tenant. A API NUNCA escreve aqui.
 */
import { TRPCError } from "@trpc/server";
import { withTenant } from "@/server/db";
import { logger } from "@/lib/logger";

export interface ByowWalletDto {
  id: string;
  address: string;
  label: string;
  isThirdParty: boolean;
  active: boolean;
  createdAt: Date;
}

function serialize(w: {
  id: string;
  address: string;
  label: string;
  isThirdParty: boolean;
  active: boolean;
  createdAt: Date;
}): ByowWalletDto {
  return {
    id: w.id,
    address: w.address,
    label: w.label,
    isThirdParty: w.isThirdParty,
    active: w.active,
    createdAt: w.createdAt,
  };
}

/** Lista as carteiras BYOW ativas do tenant (mais recentes primeiro). */
export async function listByowWallets(tenantId: string): Promise<ByowWalletDto[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.tenantByowWallet.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: "desc" },
    }),
  );
  return rows.map(serialize);
}

/**
 * Grava uma carteira na allowlist. Chamado APÓS o router validar senha + 2FA +
 * os códigos de email/WhatsApp. Idempotente por (tenant, address): se já existe
 * ativa, retorna a existente; se existe inativa, reativa.
 */
export async function addByowWallet(args: {
  tenantId: string;
  createdByUserId: string;
  address: string;
  label: string;
  isThirdParty: boolean;
}): Promise<ByowWalletDto> {
  const address = args.address.trim();
  const created = await withTenant(args.tenantId, async (tx) => {
    const existing = await tx.tenantByowWallet.findUnique({
      where: { tenantId_address: { tenantId: args.tenantId, address } },
    });
    if (existing) {
      // Reativa/atualiza o apelido; não duplica.
      return tx.tenantByowWallet.update({
        where: { id: existing.id },
        data: { active: true, label: args.label, isThirdParty: args.isThirdParty },
      });
    }
    return tx.tenantByowWallet.create({
      data: {
        tenantId: args.tenantId,
        address,
        label: args.label,
        isThirdParty: args.isThirdParty,
        createdByUserId: args.createdByUserId,
      },
    });
  });
  logger.info("byow: carteira cadastrada na allowlist", {
    tenantId: args.tenantId,
    walletId: created.id,
    isThirdParty: args.isThirdParty,
  });
  return serialize(created);
}

/** Remove (desativa) uma carteira da allowlist. Chamado após step-up 2FA. */
export async function removeByowWallet(tenantId: string, id: string): Promise<void> {
  const affected = await withTenant(tenantId, (tx) =>
    tx.tenantByowWallet.updateMany({
      where: { id, tenantId, active: true },
      data: { active: false },
    }),
  );
  if (affected.count === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Carteira não encontrada." });
  }
  logger.info("byow: carteira removida da allowlist", { tenantId, walletId: id });
}

/**
 * BARREIRA DE SEGURANCA: o endereço informado (ex.: no depósito via API) precisa
 * estar na allowlist ATIVA do tenant. Senão, lança — impede que uma API-key
 * vazada mande DePix pra uma carteira que não foi aprovada por um humano.
 */
export async function assertAddressAllowed(tenantId: string, address: string): Promise<void> {
  const addr = address.trim();
  const found = await withTenant(tenantId, (tx) =>
    tx.tenantByowWallet.findFirst({
      where: { tenantId, address: addr, active: true },
      select: { id: true },
    }),
  );
  if (!found) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Endereço não está na lista de carteiras autorizadas. Cadastre-o no painel (Configurações → DePix) antes de usá-lo.",
    });
  }
}
