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
import { getRedis } from "@/lib/redis";

// ── Payload pendente do cadastro em 2 passos ────────────────────────────────
// O que o usuário digitou e VALIDOU no passo 1 (`startAdd`) fica no Redis com TTL
// curto, chaveado por tenant+user. No passo 2 (`confirmAdd`) lemos daqui — o
// cliente só manda os códigos, não o endereço de novo. Assim o destino que o
// humano confirmou por email+WhatsApp é exatamente o que digitou, sem o cliente
// poder trocar entre os passos. Fallback (sem Redis): o router usa o payload do
// cliente — a barreira dos 2 códigos permanece.
const PENDING_TTL_SECONDS = 15 * 60;

export type PendingByowPayload = {
  address: string;
  label: string;
  isThirdParty: boolean;
};

function pendingKey(tenantId: string, userId: string): string {
  return `byow:pending-add:${tenantId}:${userId}`;
}

/** Guarda o payload validado do passo 1 (TTL curto). No-op se Redis indisponível. */
export async function stashPendingByowAdd(
  tenantId: string,
  userId: string,
  payload: PendingByowPayload,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(pendingKey(tenantId, userId), JSON.stringify(payload), "EX", PENDING_TTL_SECONDS);
}

/** Lê o payload do passo 1. Devolve null se Redis indisponível ou expirado. */
export async function readPendingByowAdd(
  tenantId: string,
  userId: string,
): Promise<PendingByowPayload | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(pendingKey(tenantId, userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingByowPayload;
    if (typeof parsed.address !== "string" || typeof parsed.label !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Apaga o payload pendente (após gravar ou cancelar). No-op se Redis indisponível. */
export async function clearPendingByowAdd(tenantId: string, userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(pendingKey(tenantId, userId));
}

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
 * Endereço de recebimento PADRÃO (primário) do tenant no modo carteira externa.
 * Default determinístico = a carteira ativa mais ANTIGA (primeira cadastrada) —
 * estável mesmo que o tenant cadastre outras depois. Usado pelo `createDeposit`
 * para rotear o DePix automaticamente quando o tenant é "external", sem cada
 * chamador (PDV/venda/link/receive) precisar informar o endereço.
 *
 * Retorna null se o tenant não tem nenhuma carteira ativa (ex.: removeu todas) —
 * o chamador decide como falhar. Aceita `tx` opcional para reusar a transação.
 */
export async function getPrimaryByowAddress(
  tenantId: string,
  tx?: TxClient,
): Promise<string | null> {
  const query = (client: TxClient) =>
    client.tenantByowWallet.findFirst({
      where: { tenantId, active: true },
      orderBy: { createdAt: "asc" },
      select: { address: true },
    });
  const row = tx ? await query(tx) : await withTenant(tenantId, query);
  return row?.address ?? null;
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

// `any` para aceitar o tx de withTenant — padrao do repo.
type TxClient = any;

/**
 * BARREIRA DE SEGURANCA: o endereço informado (ex.: no depósito via API) precisa
 * estar na allowlist ATIVA do tenant. Senão, lança — impede que uma API-key
 * vazada mande DePix pra uma carteira que não foi aprovada por um humano.
 *
 * TOCTOU: passe `tx` para validar DENTRO da mesma transação que consome o
 * endereço (ex.: o create do depósito PENDING). Assim a checagem e o uso são
 * atômicos — uma remoção concorrente da allowlist não pode se intercalar entre
 * "validei" e "criei". Sem `tx`, abre a própria transação (compat: callers que
 * só querem a barreira isolada). Ver auditoria backend R2 (2026-07-08).
 */
export async function assertAddressAllowed(
  tenantId: string,
  address: string,
  tx?: TxClient,
): Promise<void> {
  const addr = address.trim();
  const query = (client: TxClient) =>
    client.tenantByowWallet.findFirst({
      where: { tenantId, address: addr, active: true },
      select: { id: true },
    });
  const found = tx ? await query(tx) : await withTenant(tenantId, query);
  if (!found) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Endereço não está na lista de carteiras autorizadas. Cadastre-o no painel (Configurações → DePix) antes de usá-lo.",
    });
  }
}
