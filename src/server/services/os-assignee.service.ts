import { TRPCError } from "@trpc/server";
import { withAdmin } from "@/server/db";

// `any` para suportar PrismaClient e tx de withTenant — padrao do repo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

export type OsAssigneeInput = { kind: "user" | "provider"; assigneeId: string };

export type ResolvedOsAssignee = {
  technicianId: string | null;
  serviceProviderId: string | null;
  /** Nome para histórico/notificação. Prestador vem sufixado com "(prestador)". */
  name: string;
};

/**
 * Resolve e valida o técnico responsável de uma OS — usuário interno OU
 * prestador externo. Garante isolamento por tenant e que o prestador esteja
 * marcado como técnico. Retorna os FKs a gravar (exclusivos: só um é não-nulo).
 *
 * Compartilhado por `create` e `updateTechnician` para que as duas portas de
 * escrita apliquem a mesma validação.
 */
export async function resolveOsAssignee(
  tx: TxClient,
  tenantId: string,
  input: OsAssigneeInput,
): Promise<ResolvedOsAssignee> {
  if (input.kind === "user") {
    // O usuário precisa pertencer ao tenant — como membro (user_tenants) OU como
    // prestador do módulo de Comissões (`providers.userId`, tenant-scoped por RLS).
    const [techLink, providerLink] = await Promise.all([
      tx.userTenant.findUnique({
        where: { userId_tenantId: { userId: input.assigneeId, tenantId } },
        select: { userId: true },
      }),
      tx.provider.findFirst({ where: { userId: input.assigneeId }, select: { id: true } }),
    ]);
    if (!techLink && !providerLink) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Tecnico nao pertence a este tenant" });
    }
    const user = await withAdmin(async (adminTx) =>
      adminTx.user.findUnique({ where: { id: input.assigneeId }, select: { name: true } }),
    );
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Tecnico nao encontrado" });
    return { technicianId: input.assigneeId, serviceProviderId: null, name: user.name };
  }

  // `tx` é escopado por tenant (RLS) — só casa prestador do tenant ativo.
  const provider = await tx.serviceProvider.findFirst({
    where: { id: input.assigneeId, deletedAt: null },
    select: { name: true, isTechnician: true },
  });
  if (!provider) throw new TRPCError({ code: "NOT_FOUND", message: "Prestador nao encontrado" });
  if (!provider.isTechnician) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Prestador nao esta marcado como tecnico." });
  }
  return { technicianId: null, serviceProviderId: input.assigneeId, name: `${provider.name} (prestador)` };
}
