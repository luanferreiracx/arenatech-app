/**
 * Gestão de usuários de um tenant — lógica compartilhada entre o Superadmin
 * (Admin › Tenants) e o próprio tenant (Configurações › Usuários).
 *
 * Cada função recebe um `tx` (transação já com SET LOCAL ROLE app_admin via
 * withAdmin) e o `tenantId` alvo. O caller decide a autorização:
 * - Superadmin (adminProcedure): tenantId vem do input.
 * - Admin do tenant (tenantAdminProcedure): tenantId = ctx.tenantId (só o seu).
 *
 * Regras invariantes (iguais para os dois callers):
 * - Nunca administrar o superadmin interno como usuário de tenant.
 * - Não deixar o tenant sem nenhum admin (rebaixar/remover o último admin falha).
 */
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/password";
import { logger } from "@/lib/logger";
import { resolveTenantPlan } from "@/server/services/tenant-plan.service";
import { logAudit } from "@/server/services/audit-log.service";

export type TenantUserRole = "admin" | "operator";

type Tx = Prisma.TransactionClient;

/** Limite de usuários quando o tenant não tem plano (NO-KYC): default do modelo Plan. */
export const DEFAULT_MAX_USERS = 5;

/**
 * Garante que adicionar mais um usuário não estoura o `maxUsers` do plano efetivo
 * do tenant (via Subscription; fallback ao default sem plano). Chamada em AMBOS os
 * caminhos de criação (superadmin e admin do tenant) — o limite vale pra todos.
 */
export async function assertTenantUserQuota(tx: Tx, tenantId: string): Promise<void> {
  // Fecha o TOCTOU do count-then-create: sem lock, duas adições concorrentes de
  // usuário ao mesmo tenant contam o mesmo valor, passam as duas e estouram o
  // maxUsers do plano. Advisory xact-lock por tenant serializa a checagem+insert
  // (o lock segura até o COMMIT da tx que cria o userTenant). Mesmo padrão dos
  // locks de saque/índice no DePix. Exige que o caller faça o create no MESMO tx.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('tenant_user_quota:' || ${tenantId}, 0))`;
  const plan = await resolveTenantPlan(tx, tenantId);
  const maxUsers = plan?.maxUsers ?? DEFAULT_MAX_USERS;
  const currentUsers = await tx.userTenant.count({ where: { tenantId } });
  if (currentUsers >= maxUsers) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Limite de ${maxUsers} usuário(s) do plano atingido. Amplie o plano para adicionar mais.`,
    });
  }
}

function generateTempPassword(): string {
  // 12 chars base64url-ish, sem ambiguidade visual relevante para uso temporário.
  return randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

function normalizeDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function normalizeRequiredDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionalEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function assertExistingTenantUserCanBeLinked(
  user: { email: string | null; isSuperAdmin: boolean },
  expectedEmail: string | null,
): void {
  if (user.isSuperAdmin) {
    throw new TRPCError({ code: "CONFLICT", message: "CPF pertence a um usuario interno da Arena Tech" });
  }
  if (user.email && expectedEmail && normalizeEmail(user.email) !== expectedEmail) {
    throw new TRPCError({ code: "CONFLICT", message: "CPF ja existe com outro email" });
  }
}

async function assertTenantHasAnotherAdmin(tx: Tx, tenantId: string, userId: string): Promise<void> {
  const otherAdmins = await tx.userTenant.count({
    where: { tenantId, userId: { not: userId }, role: "admin" },
  });
  if (otherAdmins === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O tenant precisa manter pelo menos um usuario administrador",
    });
  }
}

async function loadTenant(tx: Tx, tenantId: string) {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant nao encontrado" });
  return tenant;
}

async function loadMembership(tx: Tx, tenantId: string, userId: string) {
  const membership = await tx.userTenant.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: {
      role: true,
      user: { select: { id: true, name: true, isSuperAdmin: true, twoFactorEnabled: true } },
      tenant: { select: { id: true, name: true } },
    },
  });
  if (!membership) throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado neste tenant" });
  if (membership.user.isSuperAdmin) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Nao e permitido administrar superadmin interno como usuario de tenant",
    });
  }
  return membership;
}

export type CreateTenantUserParams = {
  tenantId: string;
  /** Ator da operação — grava a trilha persistente (audit_logs) de quem criou. */
  actorUserId: string;
  name: string;
  cpf: string;
  email?: string | null;
  phone?: string | null;
  role: TenantUserRole;
  isTechnician?: boolean;
  isCashier?: boolean;
};

/** Cria (ou vincula um usuário existente) ao tenant. Retorna tempPassword se for conta nova. */
export async function createTenantUserInTx(tx: Tx, params: CreateTenantUserParams) {
  const tenant = await loadTenant(tx, params.tenantId);
  const cpf = normalizeRequiredDigits(params.cpf);
  const phone = normalizeDigits(params.phone);
  const email = normalizeOptionalEmail(params.email);
  const tempPassword = generateTempPassword();

  // cpf é único PARCIAL no banco (ADR 0050) — não é mais @unique p/ o Prisma.
  const existingUser = await tx.user.findFirst({
    where: { cpf },
    select: { id: true, name: true, email: true, isSuperAdmin: true },
  });
  if (existingUser) {
    assertExistingTenantUserCanBeLinked(existingUser, email);
    const existingMembership = await tx.userTenant.findUnique({
      where: { userId_tenantId: { userId: existingUser.id, tenantId: tenant.id } },
      select: { userId: true },
    });
    if (existingMembership) {
      throw new TRPCError({ code: "CONFLICT", message: "Usuario ja pertence a este tenant" });
    }
  }

  // Limite de usuários do plano — bloqueia antes de criar o vínculo NOVO.
  await assertTenantUserQuota(tx, tenant.id);

  const user = existingUser
    ? await tx.user.update({
        where: { id: existingUser.id },
        data: { name: params.name, email: existingUser.email ?? email, phone },
        select: { id: true, name: true },
      })
    : await tx.user.create({
        data: {
          name: params.name,
          cpf,
          email,
          phone,
          passwordHash: hashPassword(tempPassword),
          mustChangePassword: true,
        },
        select: { id: true, name: true },
      });

  await tx.userTenant.create({
    data: {
      userId: user.id,
      tenantId: tenant.id,
      role: params.role,
      isTechnician: params.isTechnician ?? false,
      isCashier: params.isCashier ?? false,
    },
  });

  logger.info("Tenant user created", {
    tenantId: tenant.id,
    userId: user.id,
    role: params.role,
    reusedExistingUser: Boolean(existingUser),
  });

  // Trilha persistente: criar/vincular usuário é operação de ACESSO sensível —
  // logger é transiente; sem isto não dá pra rastrear quem deu acesso pós-incidente.
  await logAudit(tx as never, {
    tenantId: tenant.id,
    userId: params.actorUserId,
    action: "created",
    entity: "tenant_user",
    entityId: user.id,
    payload: {
      role: params.role,
      isTechnician: params.isTechnician ?? false,
      isCashier: params.isCashier ?? false,
      reusedExistingUser: Boolean(existingUser),
    },
  });

  return {
    user: { id: user.id, name: user.name },
    tenant,
    tempPassword: existingUser ? null : tempPassword,
  };
}

export type UpdateTenantUserParams = {
  tenantId: string;
  /** Ator da operação — grava a trilha persistente de quem alterou. */
  actorUserId: string;
  userId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: TenantUserRole;
  isTechnician?: boolean;
  isCashier?: boolean;
};

export async function updateTenantUserInTx(tx: Tx, params: UpdateTenantUserParams) {
  const membership = await loadMembership(tx, params.tenantId, params.userId);
  if (membership.role === "admin" && params.role !== "admin") {
    await assertTenantHasAnotherAdmin(tx, params.tenantId, params.userId);
  }
  await tx.user.update({
    where: { id: params.userId },
    data: {
      name: params.name,
      email: normalizeOptionalEmail(params.email),
      phone: normalizeDigits(params.phone),
    },
  });
  await tx.userTenant.update({
    where: { userId_tenantId: { userId: params.userId, tenantId: params.tenantId } },
    data: {
      role: params.role,
      isTechnician: params.isTechnician ?? false,
      isCashier: params.isCashier ?? false,
    },
  });
  logger.info("Tenant user updated", { tenantId: params.tenantId, userId: params.userId, role: params.role });

  // Trilha persistente: mudança de papel/função altera o nível de ACESSO.
  await logAudit(tx as never, {
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "updated",
    entity: "tenant_user",
    entityId: params.userId,
    payload: {
      roleBefore: membership.role,
      roleAfter: params.role,
      isTechnician: params.isTechnician ?? false,
      isCashier: params.isCashier ?? false,
    },
  });
  return { success: true as const };
}

export async function removeTenantUserInTx(tx: Tx, tenantId: string, userId: string, actorUserId: string) {
  const membership = await loadMembership(tx, tenantId, userId);
  if (membership.role === "admin") {
    await assertTenantHasAnotherAdmin(tx, tenantId, userId);
  }
  await tx.userTenant.delete({ where: { userId_tenantId: { userId, tenantId } } });
  logger.info("Tenant user removed", { tenantId, userId });

  // Trilha persistente: revogar acesso ao tenant.
  await logAudit(tx as never, {
    tenantId,
    userId: actorUserId,
    action: "removed",
    entity: "tenant_user",
    entityId: userId,
    payload: { role: membership.role },
  });
  return { success: true as const, user: { id: membership.user.id, name: membership.user.name }, tenant: membership.tenant };
}

export async function resetTenantUserPasswordInTx(tx: Tx, tenantId: string, userId: string, actorUserId: string) {
  const membership = await loadMembership(tx, tenantId, userId);
  const tempPassword = generateTempPassword();
  await tx.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(tempPassword), mustChangePassword: true },
  });
  logger.info("Tenant user password reset", { tenantId, userId, role: membership.role });

  // Trilha persistente: operação sensível sobre credencial.
  await logAudit(tx as never, {
    tenantId,
    userId: actorUserId,
    action: "reset_password",
    entity: "tenant_user",
    entityId: userId,
    payload: { role: membership.role },
  });
  return { tempPassword, user: { id: membership.user.id, name: membership.user.name }, tenant: membership.tenant };
}

export async function resetTenantUserTwoFactorInTx(tx: Tx, tenantId: string, userId: string, actorUserId: string) {
  const membership = await loadMembership(tx, tenantId, userId);
  await tx.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorConfirmedAt: null,
      twoFactorBackupCodes: [],
    },
  });
  logger.info("Tenant user 2FA reset", {
    tenantId,
    userId,
    role: membership.role,
    wasEnabled: membership.user.twoFactorEnabled,
  });

  // Trilha persistente: desligar 2FA remove barreira de segurança.
  await logAudit(tx as never, {
    tenantId,
    userId: actorUserId,
    action: "reset_two_factor",
    entity: "tenant_user",
    entityId: userId,
    payload: { role: membership.role, wasEnabled: membership.user.twoFactorEnabled },
  });
  return { user: { id: membership.user.id, name: membership.user.name }, tenant: membership.tenant };
}
