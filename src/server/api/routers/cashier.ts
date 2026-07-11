import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { isTenantAdmin } from "@/lib/auth/roles";
import {
  computeCashDrawerCents,
  signedDepositCents,
  writeCashMovement,
  lockOpenCashSessionOrThrow,
} from "@/server/services/cash-session.service";
import {
  openCashRegisterSchema,
  closeCashRegisterSchema,
  withdrawalSchema,
  depositSchema,
  cashRegisterHistorySchema,
  reviewCashRegisterSchema,
} from "@/lib/validators/cashier";

/**
 * Helper: convert Decimal fields to number (centavos stored as Decimal(10,2),
 * but we expose as integer centavos to the frontend).
 */
function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrismaDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

export const cashierRouter = createTRPCRouter({
  /**
   * Get the current user's open cash session (if any).
   * Also returns recent history when no session is open.
   */
  current: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userId = ctx.session.user.id;

      // Check for open session (closedAt is null = open)
      const openSession = await tx.cashSession.findFirst({
        where: { userId, closedAt: null },
        include: {
          movements: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (openSession) {
        const summary = buildSummary(openSession);
        return {
          isOpen: true as const,
          register: serializeSession(openSession),
          movements: openSession.movements.map(serializeMovement),
          summary,
        };
      }

      // No open session - return recent history
      const recentSessions = await tx.cashSession.findMany({
        where: { userId },
        orderBy: { openedAt: "desc" },
        take: 5,
      });

      return {
        isOpen: false as const,
        register: null,
        movements: [],
        summary: null,
        recentRegisters: recentSessions.map(serializeSession),
      };
    });
  }),

  /** Open a new cash session */
  open: tenantProcedure
    .input(openCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;

        // Only 1 open session per user
        const existing = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Voce ja possui um caixa aberto",
          });
        }

        const initialDecimal = centsToPrismaDecimal(input.initialBalance);

        // O pré-check acima é fast-path/UX; a garantia real é o índice único
        // parcial `cash_sessions_one_open_per_user` (WHERE closed_at IS NULL).
        // Duas aberturas concorrentes que passem do findFirst colidem no índice —
        // traduz a violação (P2002) na mesma mensagem amigável, não num 500.
        let session;
        try {
          session = await tx.cashSession.create({
            data: {
              tenantId: ctx.tenantId,
              userId,
              initialBalance: initialDecimal,
              openingNote: input.openingNote ?? null,
            },
          });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Voce ja possui um caixa aberto",
            });
          }
          throw e;
        }

        // Create opening deposit movement
        await writeCashMovement(tx, {
          tenantId: ctx.tenantId,
          cashSessionId: session.id,
          type: "DEPOSIT",
          nature: "INCOME",
          amountCents: input.initialBalance,
          description: "Abertura de caixa",
          createdByUserId: userId,
        });

        return serializeSession(session);
      });
    }),

  /** Close the current cash session */
  close: tenantProcedure
    .input(closeCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;

        const session = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhum caixa aberto encontrado",
          });
        }

        // FIN1: claim atômico do fechamento (CAS). O row-lock do UPDATE serializa
        // closes concorrentes (anti duplo-close); count 0 = já fechado por outra
        // operação. Um throw depois (validação da nota) rola este claim de volta.
        const closedAt = new Date();
        const claim = await tx.cashSession.updateMany({
          where: { id: session.id, closedAt: null },
          data: { closedAt, closedByUserId: userId, closeType: "MANUAL" },
        });
        if (claim.count !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este caixa já foi fechado por outra operação.",
          });
        }

        // Re-lê os movimentos TÃO TARDE quanto possível (após o claim) para o
        // resumo incluir vendas que caíram na sessão até aqui — encolhe a janela
        // da corrida fechar-caixa × finalizar-venda a ~zero. (Eliminação total
        // exigiria SELECT ... FOR UPDATE no finalize — follow-up documentado.)
        const movements = await tx.cashMovement.findMany({
          where: { cashSessionId: session.id },
          select: { type: true, amount: true, nature: true, paymentMethod: true, createdAt: true },
        });
        const summary = buildSummary({ ...session, movements });
        const calculatedCents = summary.expectedCashBalance;
        const declaredCents = input.declaredBalance;
        const differenceCents = declaredCents - calculatedCents;

        // Threshold: diferenca > R$ 5 (500 centavos) OU > 1% do calculado
        // exige nota de fechamento. Evita caixa fechado com -R$ 500 silencioso.
        const absDiff = Math.abs(differenceCents);
        const onePctCents = Math.max(500, Math.round(calculatedCents * 0.01));
        if (absDiff > onePctCents && !input.closingNote?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Divergencia de R$ ${(absDiff / 100).toFixed(2)} exige observacao no fechamento.`,
          });
        }

        // Conferencia por forma de pagamento (paridade Laravel): operador
        // marca cada forma nao-dinheiro como "confere" ou informa o valor real.
        // Persistimos em closingNote como bloco audit.
        //
        // CX-B2 (auditoria financeira 2026-07-11): o `expectedAmount` era lido do
        // INPUT do cliente — o operador podia mandar expected==reported para
        // qualquer forma e a divergencia de cartao/PIX NUNCA aparecia (auditoria
        // falsificavel pelo proprio operador). Agora o esperado por forma e
        // RECALCULADO no servidor a partir dos movimentos re-lidos; o valor do
        // cliente e ignorado. So o `reportedAmount` (o que o operador contou) e a
        // flag `verified` vem do cliente.
        const methodExpected = buildPaymentMethodSummary(movements);
        let noteParts: string[] = [];
        if (input.closingNote?.trim()) noteParts.push(input.closingNote.trim());
        if (input.methodVerifications && input.methodVerifications.length > 0) {
          const withExpected = input.methodVerifications.map((m) => ({
            ...m,
            expectedCents: methodExpected[m.method]?.total ?? 0,
          }));
          const divergent = withExpected.filter(
            (m) =>
              !m.verified &&
              typeof m.reportedAmount === "number" &&
              m.reportedAmount !== m.expectedCents,
          );
          const checked = withExpected.filter((m) => m.verified);
          const audit = [
            checked.length > 0
              ? `Conferidas: ${checked.map((m) => m.method).join(", ")}`
              : null,
            divergent.length > 0
              ? `Divergencias: ${divergent
                  .map(
                    (m) =>
                      `${m.method} esperado=${(m.expectedCents / 100).toFixed(2)} contado=${((m.reportedAmount ?? 0) / 100).toFixed(2)}`,
                  )
                  .join("; ")}`
              : null,
          ].filter(Boolean);
          if (audit.length > 0) noteParts.push(`[Conferencia] ${audit.join(" | ")}`);
        }
        const finalNote = noteParts.length > 0 ? noteParts.join("\n").slice(0, 1500) : null;

        // Grava os saldos apurados (closedAt/closedByUserId/closeType já foram
        // setados atomicamente no claim acima).
        await tx.cashSession.update({
          where: { id: session.id },
          data: {
            declaredBalance: centsToPrismaDecimal(declaredCents),
            calculatedBalance: centsToPrismaDecimal(calculatedCents),
            difference: centsToPrismaDecimal(differenceCents),
            closingNote: finalNote,
          },
        });

        return { success: true, difference: differenceCents };
      });
    }),

  /** Register a withdrawal (sangria) */
  withdrawal: tenantProcedure
    .input(withdrawalSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;

        const session = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhum caixa aberto encontrado",
          });
        }

        // K3/K1: serializa contra outras sangrias e contra o fechamento. Sem o
        // lock, duas sangrias concorrentes liam o MESMO saldo e ambas passavam a
        // validação → gaveta negativa; e a saída podia ser gravada numa sessão
        // recém-fechada. Após o lock, RE-LÊ os movimentos (uma sangria
        // concorrente pode ter commitado) e revalida o saldo.
        await lockOpenCashSessionOrThrow(tx, session.id);
        const movements = await tx.cashMovement.findMany({
          where: { cashSessionId: session.id },
          select: { type: true, amount: true, nature: true, paymentMethod: true, createdAt: true },
        });
        const summary = buildSummary({ ...session, movements });
        if (input.amount > summary.expectedCashBalance) {
          const available = (summary.expectedCashBalance / 100).toLocaleString(
            "pt-BR",
            { style: "currency", currency: "BRL" },
          );
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Saldo em dinheiro insuficiente. Disponivel: ${available}`,
          });
        }

        await writeCashMovement(tx, {
          tenantId: ctx.tenantId,
          cashSessionId: session.id,
          type: "WITHDRAWAL",
          nature: "OUTCOME",
          amountCents: input.amount,
          paymentMethod: "dinheiro",
          description: input.description,
          createdByUserId: userId,
        });

        return { success: true };
      });
    }),

  /** Register a deposit (suprimento) */
  deposit: tenantProcedure
    .input(depositSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;

        const session = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhum caixa aberto encontrado",
          });
        }

        // K1: confirma sob lock que a sessão não foi fechada entre o findFirst e
        // a escrita — não grava suprimento numa gaveta já fechada.
        await lockOpenCashSessionOrThrow(tx, session.id);

        await writeCashMovement(tx, {
          tenantId: ctx.tenantId,
          cashSessionId: session.id,
          type: "DEPOSIT",
          nature: "INCOME",
          amountCents: input.amount,
          paymentMethod: "dinheiro",
          description: input.description,
          createdByUserId: userId,
        });

        return { success: true };
      });
    }),

  /** Summary for the current open session (for closing screen) */
  closingSummary: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userId = ctx.session.user.id;

      const session = await tx.cashSession.findFirst({
        where: { userId, closedAt: null },
        include: { movements: true },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nenhum caixa aberto encontrado",
        });
      }

      return {
        register: serializeSession(session),
        summary: buildSummary(session),
        paymentMethodSummary: buildPaymentMethodSummary(session.movements),
      };
    });
  }),

  /** History of closed sessions with pagination and date filter */
  history: tenantProcedure
    .input(cashRegisterHistorySchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const userId = ctx.session.user.id;
        const where: Record<string, unknown> = {
          userId,
          closedAt: { not: null },
        };

        if (input.dateFrom || input.dateTo) {
          const openedAt: Record<string, Date> = {};
          if (input.dateFrom) openedAt.gte = new Date(input.dateFrom);
          if (input.dateTo) {
            const end = new Date(input.dateTo);
            end.setHours(23, 59, 59, 999);
            openedAt.lte = end;
          }
          where.openedAt = openedAt;
        }

        const [data, total] = await Promise.all([
          tx.cashSession.findMany({
            where,
            orderBy: { openedAt: "desc" },
            skip: input.page * input.pageSize,
            take: input.pageSize,
          }),
          tx.cashSession.count({ where }),
        ]);

        return {
          data: data.map(serializeSession),
          total,
          pageCount: Math.ceil(total / input.pageSize),
        };
      });
    }),

  /** Detail of a specific cash session (for report) */
  byId: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // findFirst com tenantId explicito: defesa em profundidade caso
        // RLS falhe. RLS ja filtra, mas este predicado e safety net.
        const session = await tx.cashSession.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId },
          include: {
            movements: {
              orderBy: { createdAt: "asc" },
            },
          },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Caixa nao encontrado",
          });
        }

        // A1: o detalhe do caixa (todos os movimentos, valores, divergência) é do
        // dono da sessão ou de gerência. Operador não abre o caixa de um colega.
        if (session.userId !== ctx.session.user.id && !isTenantAdmin(ctx.session, ctx.tenantId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para ver este caixa" });
        }

        return {
          register: serializeSession(session),
          movements: session.movements.map(serializeMovement),
          summary: buildSummary(session),
          paymentMethodSummary: buildPaymentMethodSummary(session.movements),
        };
      });
    }),

  /**
   * List closed cash sessions pending review.
   * A session is pending review if `verified` is false.
   */
  pendingReviews: tenantProcedure
    .input(
      z
        .object({
          page: z.number().int().min(0).optional(),
          pageSize: z.number().int().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      // A1 (auditoria fin 2026-07-10): conferência é função de gerência — a lista
      // de caixas pendentes expõe fechamento/divergência de TODOS os operadores.
      // A mutation `review` já é admin-only; a lista que a alimenta também deve ser.
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerente pode ver caixas pendentes de conferencia" });
      }
      const page = input?.page ?? 0;
      const pageSize = input?.pageSize ?? 20;
      return ctx.withTenant(async (tx) => {
        const where = { closedAt: { not: null }, verified: false } as const;
        const [pendingSessions, total] = await Promise.all([
          tx.cashSession.findMany({
            where,
            orderBy: { closedAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.cashSession.count({ where }),
        ]);

        // Resolve user names via UserTenant — tenant-scoped, evita leak de
        // users de outros tenants (table users global sem RLS).
        const userIds = [...new Set(pendingSessions.map((r) => r.userId))];
        const userTenants = userIds.length > 0
          ? await tx.userTenant.findMany({
              where: { tenantId: ctx.tenantId, userId: { in: userIds } },
              select: { userId: true, user: { select: { name: true } } },
            })
          : [];
        const userMap = new Map(userTenants.map((ut) => [ut.userId, ut.user.name]));

        return {
          data: pendingSessions.map((r) => ({
            ...serializeSession(r),
            userName: userMap.get(r.userId) ?? "Operador",
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /**
   * Review (conferir) a closed cash session.
   * Sets the reported balance, calculates difference, and marks as verified.
   */
  review: tenantProcedure
    .input(reviewCashRegisterSchema)
    .mutation(async ({ ctx, input }) => {
      // RBAC: a conferência é o passo de auditoria do gestor sobre o caixa fechado
      // do operador. Restringe a admin do tenant para preservar a segregação de
      // funções (o operador não confere o próprio caixa).
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas administradores do tenant podem conferir caixas.",
        });
      }
      return ctx.withTenant(async (tx) => {
        const session = await tx.cashSession.findFirst({
          where: { id: input.cashSessionId, tenantId: ctx.tenantId },
          include: { movements: true },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Caixa nao encontrado",
          });
        }

        if (session.closedAt === null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas caixas fechados podem ser conferidos",
          });
        }

        if (session.verified) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este caixa ja foi conferido",
          });
        }

        const summary = buildSummary(session);
        const systemBalance = summary.expectedCashBalance;
        const differenceCents = input.reportedBalance - systemBalance;

        await tx.cashSession.update({
          where: { id: input.cashSessionId },
          data: {
            declaredBalance: centsToPrismaDecimal(input.reportedBalance),
            calculatedBalance: centsToPrismaDecimal(systemBalance),
            difference: centsToPrismaDecimal(differenceCents),
            verified: true,
            verifiedAt: new Date(),
            verifiedByUserId: ctx.session.user.id,
            verifiedNote: input.notes ?? null,
          },
        });

        return {
          success: true,
          systemBalance,
          reportedBalance: input.reportedBalance,
          difference: differenceCents,
        };
      });
    }),

  /**
   * Check if current user has an open cash session (for PDV polling).
   * Returns minimal data without heavy queries.
   */
  statusCheck: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const userId = ctx.session.user.id;
      const openSession = await tx.cashSession.findFirst({
        where: { userId, closedAt: null },
        select: { id: true, openedAt: true },
      });

      return {
        isOpen: !!openSession,
        registerId: openSession?.id ?? null,
        openedAt: openSession?.openedAt ?? null,
      };
    });
  }),

  /**
   * List all currently open cash sessions across all users. (Manager+)
   */
  openCashiers: tenantProcedure.query(async ({ ctx }) => {
    // A1: visão de gerência (docstring já dizia "Manager+", faltava o gate).
    // Lista caixas abertos de todos os operadores — segregação de funções.
    if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerente pode ver os caixas abertos" });
    }
    return ctx.withTenant(async (tx) => {
      // Safety cap: tipicamente 1 por operador (max ~100). Limit defensivo.
      const openSessions = await tx.cashSession.findMany({
        where: { closedAt: null },
        select: { id: true, userId: true, openedAt: true },
        orderBy: { openedAt: "desc" },
        take: 200,
      });

      if (openSessions.length === 0) return [];

      // Tenant-scoped: usa UserTenant (impede leak entre tenants).
      const userIds = [...new Set(openSessions.map((r) => r.userId))];
      const userTenants = await tx.userTenant.findMany({
        where: { tenantId: ctx.tenantId, userId: { in: userIds } },
        select: { userId: true, user: { select: { name: true } } },
      });
      const userMap = new Map(userTenants.map((ut) => [ut.userId, ut.user.name]));

      return openSessions.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: userMap.get(r.userId) ?? "Operador",
        openedAt: r.openedAt,
      }));
    });
  }),

  // ═══════════════════════════════════════
  // PUBLIC API — Consumed by PDV/OS modules
  // ═══════════════════════════════════════

  /**
   * @public-api Consumed by PDV module.
   * Returns the open session for a given user (or current user if omitted).
   */
  getOpenSession: tenantProcedure
    .input(z.object({ userId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = input?.userId ?? ctx.session.user.id;
      return ctx.withTenant(async (tx) => {
        return tx.cashSession.findFirst({
          where: { userId, closedAt: null },
          select: { id: true, userId: true, openedAt: true, initialBalance: true },
        });
      });
    }),

  /** Register expense (despesa avulsa) */
  expense: tenantProcedure
    .input(z.object({
      amount: z.number().int().min(1),
      paymentMethod: z.string().min(1),
      description: z.string().min(3).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const session = await tx.cashSession.findFirst({
          where: { userId: ctx.session.user.id, closedAt: null },
        });
        if (!session) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Caixa nao esta aberto" });
        }

        // K1: não grava despesa numa sessão fechada em paralelo.
        await lockOpenCashSessionOrThrow(tx, session.id);

        await writeCashMovement(tx, {
          tenantId: ctx.tenantId,
          cashSessionId: session.id,
          type: "EXPENSE",
          nature: "OUTCOME",
          amountCents: input.amount,
          paymentMethod: input.paymentMethod,
          description: input.description,
          referenceType: "manual",
          createdByUserId: ctx.session.user.id,
        });

        return { success: true };
      });
    }),

  /** Force close another user's session (Manager+) */
  forceClose: tenantProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      reason: z.string().min(3).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerente pode forcar fechamento" });
      }
      return ctx.withTenant(async (tx) => {
        const session = await tx.cashSession.findFirst({
          where: { id: input.sessionId, closedAt: null },
          include: { movements: true },
        });
        if (!session) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sessao nao encontrada ou ja fechada" });
        }

        // Mesmo cálculo do fechamento manual (dinheiro na gaveta) — antes usava
        // calculateSessionBalance (INCOME−OUTCOME de qualquer forma), então o
        // caixa forçado divergia do que o manual calcularia. Em centavos.
        const calculatedCents = computeCashDrawerCents(
          decimalToCents(session.initialBalance),
          session.movements.map((m) => ({
            nature: m.nature,
            amountCents: decimalToCents(m.amount),
            paymentMethod: m.paymentMethod,
          })),
        );
        const calculatedBalance = calculatedCents / 100;

        // K2: CAS no fechamento forçado — guarda `closedAt: null`. Sem isto, dois
        // forceClose concorrentes (ou um forceClose × close manual) faziam
        // last-writer-wins, sobrescrevendo o fechamento do outro. count 0 = a
        // sessão já foi fechada por outra operação.
        const claim = await tx.cashSession.updateMany({
          where: { id: session.id, closedAt: null },
          data: {
            calculatedBalance: new Prisma.Decimal(calculatedBalance),
            declaredBalance: new Prisma.Decimal(calculatedBalance),
            difference: new Prisma.Decimal(0),
            closeType: "MANUAL",
            closedByUserId: ctx.session.user.id,
            closedAt: new Date(),
            closingNote: `Fechamento forcado: ${input.reason}`,
            verified: false,
          },
        });
        if (claim.count !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta sessao ja foi fechada por outra operacao.",
          });
        }

        // Audit explicito: fechamento forcado MASCARA divergencia (difference
        // setado pra 0 mesmo se calculatedBalance != saldo fisico real).
        // Registra pra rastreabilidade — gestor responsavel pela acao.
        const { logAudit } = await import("@/server/services/audit-log.service");
        await logAudit(tx as never, {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "force_close",
          entity: "cash_session",
          entityId: session.id,
          payload: {
            calculatedBalance,
            originalUserId: session.userId,
            reason: input.reason,
          },
        });

        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // MANUAL ADJUSTMENT (ajuste manual)
  // ═══════════════════════════════════════

  /** Register manual cash adjustment (faithful to Laravel registrarAjuste) */
  manualAdjustment: tenantProcedure
    .input(z.object({
      amount: z.number().int().min(1).max(100_000_000), // centavos
      nature: z.enum(["INCOME", "OUTCOME"]),
      reason: z.string().min(3, "Motivo obrigatorio").max(300),
      // K4 (auditoria fin 2026-07-10): caixa-alvo do ajuste. O gerente corrige a
      // gaveta do OPERADOR conferido — sem isto o ajuste caía sempre na sessão do
      // próprio gerente (caixa errado, ou "nenhum caixa aberto" se ele não tivesse
      // um). Omitido = ajusta o próprio caixa (retrocompatível).
      sessionId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerente pode fazer ajuste manual" });
      }

      return ctx.withTenant(async (tx) => {
        // Resolve a sessão-alvo: por sessionId (caixa de qualquer operador do
        // tenant, deve estar aberta) ou, na ausência, o próprio caixa do gerente.
        const session = input.sessionId
          ? await tx.cashSession.findFirst({
              where: { id: input.sessionId, tenantId: ctx.tenantId, closedAt: null },
            })
          : await tx.cashSession.findFirst({
              where: { userId: ctx.session.user.id, closedAt: null },
            });

        if (!session) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: input.sessionId
              ? "Caixa nao encontrado ou ja fechado"
              : "Nenhum caixa aberto",
          });
        }

        // K1: não grava ajuste numa sessão fechada em paralelo.
        await lockOpenCashSessionOrThrow(tx, session.id);

        // DEPOSIT com nature variável: OUTCOME = retirada da gaveta pelo gerente.
        // O writer aceita ambos para DEPOSIT (ver REQUIRED_NATURE).
        const movement = await writeCashMovement(tx, {
          tenantId: ctx.tenantId,
          cashSessionId: session.id,
          type: "DEPOSIT",
          nature: input.nature,
          amountCents: input.amount,
          paymentMethod: "ajuste_manual",
          description: `[AJUSTE] ${input.reason}`,
          referenceType: "manual_adjustment",
          createdByUserId: ctx.session.user.id,
        });

        const { logAudit } = await import("@/server/services/audit-log.service");
        await logAudit(tx as never, {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "cash_manual_adjustment",
          entity: "cash_movement",
          entityId: movement.id,
          payload: {
            sessionId: session.id,
            amountCents: input.amount,
            nature: input.nature,
            reason: input.reason,
          },
        });

        return { success: true };
      });
    }),

  /**
   * Estatisticas agregadas de caixa por periodo. Paridade Laravel
   * `CaixaService::getEstatisticasPeriodo`.
   */
  periodStats: tenantProcedure
    .input(
      z.object({
        from: z.string(), // ISO date
        to: z.string(),   // ISO date
        userId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // A1: operador só vê as próprias estatísticas. Pedir userId de outro
      // operador — ou o agregado geral (sem userId) — é visão de gerência.
      const isAdmin = isTenantAdmin(ctx.session, ctx.tenantId);
      const askingForOther = input.userId ? input.userId !== ctx.session.user.id : true;
      if (askingForOther && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerente pode ver estatisticas de outros operadores" });
      }
      return ctx.withTenant(async (tx) => {
        const fromDate = new Date(input.from);
        const toDate = new Date(input.to + "T23:59:59");

        // Agrega movimentos por movement.createdAt no range (antes era por
        // session.openedAt — pegava sessoes que abriram no dia mas
        // perdia movimentos de sessoes abertas no dia anterior que
        // continuaram no range). Sessions count: distintas no range.
        const movements = await tx.cashMovement.findMany({
          where: {
            createdAt: { gte: fromDate, lte: toDate },
            ...(input.userId ? { session: { userId: input.userId } } : {}),
          },
          select: {
            type: true,
            amount: true,
            nature: true,
            referenceType: true,
            cashSessionId: true,
          },
        });

        const sessionsInRange = await tx.cashSession.findMany({
          where: {
            OR: [
              { openedAt: { gte: fromDate, lte: toDate } },
              { closedAt: { gte: fromDate, lte: toDate } },
            ],
            ...(input.userId ? { userId: input.userId } : {}),
          },
          select: { id: true, difference: true },
        });

        let totalSales = 0;
        let totalDeposits = 0;
        let totalWithdrawals = 0;
        let totalExpenses = 0;
        let totalReversals = 0;
        let totalDifference = 0;

        for (const m of movements) {
          const amt = Number(m.amount);
          const signed = m.nature === "INCOME" ? amt : -amt;
          if (m.type === "SALE") totalSales += signed;
          if (m.type === "DEPOSIT") totalDeposits += signed;
          if (m.type === "WITHDRAWAL") totalWithdrawals += signed;
          if (m.type === "EXPENSE") totalExpenses += signed;
          if (m.referenceType === "reversal" || m.referenceType === "sale_reversal") {
            totalReversals += signed;
          }
        }
        for (const s of sessionsInRange) {
          totalDifference += Number(s.difference ?? 0);
        }

        return {
          sessionsCount: sessionsInRange.length,
          movementsCount: movements.length,
          totalSales: Math.round(totalSales * 100), // centavos
          totalDeposits: Math.round(totalDeposits * 100),
          totalWithdrawals: Math.round(totalWithdrawals * 100),
          totalExpenses: Math.round(totalExpenses * 100),
          totalReversals: Math.round(totalReversals * 100),
          totalDifference: Math.round(totalDifference * 100),
          from: input.from,
          to: input.to,
        };
      });
    }),
});

// ── Helpers ──

interface SessionWithMovements {
  id: string;
  initialBalance: Prisma.Decimal;
  declaredBalance: Prisma.Decimal | null;
  calculatedBalance: Prisma.Decimal | null;
  difference: Prisma.Decimal | null;
  movements: Array<{
    type: string;
    amount: Prisma.Decimal;
    nature: string;
    paymentMethod: string | null;
    createdAt: Date;
  }>;
}

interface Summary {
  openingBalance: number;
  totalSales: number;
  totalSalesCash: number;
  totalSalesCard: number;
  totalSalesPix: number;
  totalSalesDepix: number;
  totalSalesOther: number;
  totalWithdrawals: number;
  totalDeposits: number;
  totalExpenses: number;
  salesCount: number;
  /** Breakdown completo por metodo de pagamento (paymentMethod -> total em centavos).
   * Inclui metodos custom (DePix, crediario, boleto, cheque, etc) que nao
   * caem nos buckets principais. */
  salesByMethod: Record<string, number>;
  /** Expected cash in drawer: opening + cash sales + deposits - withdrawals - expenses */
  expectedCashBalance: number;
}

function buildSummary(session: SessionWithMovements): Summary {
  const opening = decimalToCents(session.initialBalance);
  let totalSales = 0;
  let totalSalesCash = 0;
  let totalSalesCard = 0;
  let totalSalesPix = 0;
  let totalSalesDepix = 0;
  let totalSalesOther = 0;
  let totalWithdrawals = 0;
  let totalDeposits = 0;
  let totalExpenses = 0;
  let salesCount = 0;
  const salesByMethod: Record<string, number> = {};

  for (const m of session.movements) {
    const amount = decimalToCents(m.amount);
    switch (m.type) {
      case "SALE": {
        totalSales += amount;
        salesCount++;
        const method = m.paymentMethod ?? "outros";
        salesByMethod[method] = (salesByMethod[method] ?? 0) + amount;
        if (method === "dinheiro") totalSalesCash += amount;
        else if (method === "cartao_credito" || method === "cartao_debito")
          totalSalesCard += amount;
        else if (method === "pix") totalSalesPix += amount;
        else if (method === "depix") totalSalesDepix += amount;
        else totalSalesOther += amount;
        break;
      }
      case "WITHDRAWAL":
        totalWithdrawals += amount;
        break;
      case "DEPOSIT":
        // Ajuste manual grava type=DEPOSIT com nature variável (OUTCOME =
        // retirada). Assina por nature — ver signedDepositCents.
        totalDeposits += signedDepositCents(amount, m.nature);
        break;
      case "EXPENSE":
        totalExpenses += amount;
        break;
    }
  }

  // Dinheiro esperado na gaveta: só os movimentos que tocam a gaveta (dinheiro
  // + ajuste_manual). Fonte única compartilhada com o fechamento forçado/auto —
  // ver computeCashDrawerCents. Os totais acima seguem informativos (todas as
  // formas), mas a conferência do caixa é drawer-only: uma despesa paga no
  // cartão, p.ex., não reduz mais o dinheiro contado.
  const expectedCashBalance = computeCashDrawerCents(
    opening,
    session.movements.map((m) => ({
      nature: m.nature,
      amountCents: decimalToCents(m.amount),
      paymentMethod: m.paymentMethod,
    })),
  );

  return {
    openingBalance: opening,
    totalSales,
    totalSalesCash,
    totalSalesCard,
    totalSalesPix,
    totalSalesDepix,
    totalSalesOther,
    totalWithdrawals,
    totalDeposits,
    totalExpenses,
    salesCount,
    salesByMethod,
    expectedCashBalance,
  };
}

interface MovementForSummary {
  type: string;
  amount: Prisma.Decimal;
  paymentMethod: string | null;
}

function buildPaymentMethodSummary(
  movements: MovementForSummary[],
): Record<string, { count: number; total: number }> {
  const result: Record<string, { count: number; total: number }> = {};
  for (const m of movements) {
    if (m.type !== "SALE") continue;
    const method = m.paymentMethod ?? "outros";
    if (!result[method]) result[method] = { count: 0, total: 0 };
    result[method]!.count++;
    result[method]!.total += decimalToCents(m.amount);
  }
  return result;
}

interface SerializableSession {
  id: string;
  tenantId: string;
  userId: string;
  initialBalance: Prisma.Decimal;
  declaredBalance: Prisma.Decimal | null;
  calculatedBalance: Prisma.Decimal | null;
  difference: Prisma.Decimal | null;
  openingNote: string | null;
  closingNote: string | null;
  closeType: string | null;
  verified: boolean;
  verifiedAt: Date | null;
  verifiedByUserId: string | null;
  verifiedNote: string | null;
  openedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function serializeSession(r: SerializableSession) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    userId: r.userId,
    // Keep "status" field in API response for backward compat with UI
    status: r.closedAt ? "CLOSED" : "OPEN",
    openingBalance: decimalToCents(r.initialBalance),
    closingBalance: r.declaredBalance != null ? decimalToCents(r.declaredBalance) : null,
    expectedBalance: r.calculatedBalance != null ? decimalToCents(r.calculatedBalance) : null,
    difference: r.difference != null ? decimalToCents(r.difference) : null,
    openingNotes: r.openingNote,
    notes: r.closingNote,
    verified: r.verified,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

interface SerializableMovement {
  id: string;
  type: string;
  amount: Prisma.Decimal;
  nature: string;
  paymentMethod: string | null;
  description: string | null;
  referenceId: string | null;
  referenceType: string | null;
  createdByUserId: string;
  createdAt: Date;
}

function serializeMovement(m: SerializableMovement) {
  return {
    id: m.id,
    type: m.type,
    amount: decimalToCents(m.amount),
    nature: m.nature,
    paymentMethod: m.paymentMethod,
    description: m.description,
    referenceId: m.referenceId,
    referenceType: m.referenceType,
    userId: m.createdByUserId,
    createdAt: m.createdAt,
  };
}
