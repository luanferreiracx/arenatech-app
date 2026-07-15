import type { PrismaClient } from "@prisma/client"
import { Prisma } from "@prisma/client"
import { TRPCError } from "@trpc/server"

/** Decimal (reais) → centavos inteiros. */
function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0
  return Math.round(Number(v) * 100)
}

/**
 * Regra de negocio (auditoria 2026-06-26, P2-1): um estorno com valor > 0 gera
 * uma saida (WITHDRAWAL) na gaveta, entao EXIGE caixa aberto. Sem isso a saida
 * nao era registrada e a conferencia de caixa ficava sub-reportada (gaveta
 * desbalanceada). Fonte unica usada pelos guards de estorno (venda e OS).
 */
export function refundNeedsOpenCashSession(refundAmountCents: number): boolean {
  return refundAmountCents > 0
}

/**
 * K1/K2/K3 (auditoria fin 2026-07-10): a rota de caixa nunca teve lock nem CAS —
 * `findFirst(closedAt:null)` → decide → escreve movimento/fecha, tudo em READ
 * COMMITTED. Isso permitia (K1) gravar movimento em sessão recém-fechada, (K2)
 * double-close/lost-update no fechamento e (K3) duas sangrias furarem a
 * validação de saldo (gaveta negativa).
 *
 * Este helper reivindica a linha da sessão com `SELECT ... FOR UPDATE` e
 * confirma que ela ainda está aberta. Como o fechamento e todos os escritores
 * de movimento pegam o MESMO lock, eles se serializam: quem fecha bloqueia os
 * escritores até o commit; um escritor que chega depois do fechamento vê
 * `closed_at` setado e recebe CONFLICT — nunca grava numa gaveta fechada. Após o
 * lock, os movimentos devem ser RE-LIDOS (um concorrente pode ter commitado
 * entre o findFirst e o lock). RLS já escopa por tenant (SET LOCAL).
 */
export async function lockOpenCashSessionOrThrow(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM cash_sessions WHERE id = ${sessionId}::uuid AND closed_at IS NULL FOR UPDATE
  `
  if (rows.length !== 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "O caixa foi fechado por outra operacao. Atualize a tela.",
    })
  }
}

/**
 * Contribuição líquida de um movimento DEPOSIT ao caixa esperado, em centavos.
 *
 * `manualAdjustment` grava `type=DEPOSIT` com `nature` variável: OUTCOME =
 * dinheiro RETIRADO da gaveta (ex.: "gerente removeu R$200"). O fechamento
 * (buildSummary) somava todo DEPOSIT como positivo, então uma retirada entrava
 * como entrada — erro de 2× o valor na conferência. Este helper assina por
 * nature, espelhando o cálculo de periodStats. Depósito comum (nature=INCOME)
 * segue positivo. Fonte única do invariante, testável sem banco.
 */
export function signedDepositCents(amountCents: number, nature: string): number {
  return nature === "OUTCOME" ? -amountCents : amountCents
}

/**
 * Formas de pagamento que movimentam a GAVETA física de dinheiro. Só estas
 * entram no caixa esperado: dinheiro (venda/sangria/suprimento em espécie) e
 * ajuste_manual (correção deliberada da gaveta pelo gerente). Cartão/PIX/DePix
 * não passam pela gaveta — uma despesa paga no cartão NÃO reduz o dinheiro
 * contado no fechamento.
 */
const CASH_DRAWER_METHODS = new Set(["dinheiro", "ajuste_manual"])

/**
 * A forma de pagamento movimenta a GAVETA física? Fonte única (CASH_DRAWER_METHODS).
 * Usada por guards de estorno para exigir caixa aberto SÓ quando o estorno vai
 * gerar saída em espécie (dinheiro) — PIX/cartão/DePix não passam pela gaveta.
 */
export function paymentMethodAffectsCashDrawer(method: string | null | undefined): boolean {
  return !!method && CASH_DRAWER_METHODS.has(method)
}

export interface CashDrawerMovement {
  nature: string
  amountCents: number
  /** null = movimento de abertura (o valor já entra via openingCents). */
  paymentMethod: string | null
}

/**
 * Dinheiro ESPERADO na gaveta ao fechar, em centavos. Fonte ÚNICA da conferência
 * de caixa — usada pelo fechamento manual (buildSummary), pelo forçado e pelo
 * automático, que antes divergiam:
 *   - buildSummary somava TODA despesa (mesmo paga no cartão) contra o dinheiro;
 *   - calculateSessionBalance (force/auto) somava INCOME−OUTCOME de QUALQUER
 *     forma, então o mesmo caixa fechado manual × forçado dava saldos diferentes.
 *
 * Regra correta: abertura + (INCOME − OUTCOME) apenas dos movimentos que tocam
 * a gaveta (CASH_DRAWER_METHODS). O movimento de abertura (paymentMethod null)
 * já está em openingCents; os demais null (se houver) ficam de fora por não
 * serem dinheiro em espécie.
 */
export function computeCashDrawerCents(
  openingCents: number,
  movements: CashDrawerMovement[],
): number {
  let drawer = openingCents
  for (const m of movements) {
    if (m.paymentMethod === null) continue // abertura já contabilizada
    if (!CASH_DRAWER_METHODS.has(m.paymentMethod)) continue // não é dinheiro
    drawer += m.nature === "OUTCOME" ? -m.amountCents : m.amountCents
  }
  return drawer
}

// ── Escritor canônico de CashMovement ──

export type CashMovementType = "SALE" | "WITHDRAWAL" | "DEPOSIT" | "EXPENSE"
export type CashMovementNature = "INCOME" | "OUTCOME"

/**
 * Nature obrigatória por tipo. DEPOSIT aceita as duas (depósito/abertura =
 * INCOME; ajuste_manual de retirada = OUTCOME). Os demais têm nature fixa —
 * gravar SALE como OUTCOME (ou WITHDRAWAL como INCOME) é bug de dados.
 */
const REQUIRED_NATURE: Record<CashMovementType, CashMovementNature | null> = {
  SALE: "INCOME",
  WITHDRAWAL: "OUTCOME",
  EXPENSE: "OUTCOME",
  DEPOSIT: null, // ambos (ver acima)
}

export interface WriteCashMovementInput {
  tenantId: string
  cashSessionId: string
  type: CashMovementType
  nature: CashMovementNature
  /** Valor em centavos inteiros (o writer converte para Decimal). */
  amountCents: number
  createdByUserId: string
  description: string
  paymentMethod?: string | null
  paymentMethodId?: string | null
  referenceType?: string | null
  referenceId?: string | null
}

/**
 * Escritor ÚNICO de CashMovement. Antes o shape era remontado à mão em ~14
 * lugares (sale/cashier/financial/stock/service-order/operation/provider-
 * commission), e foi assim que um DEPOSIT ganhou nature OUTCOME por engano
 * (bug do fechamento, #369). Aqui o invariante type↔nature é validado uma vez,
 * e a conversão centavos→Decimal fica num lugar só.
 *
 * @throws {TRPCError} INTERNAL_SERVER_ERROR se o par type/nature for inválido.
 */
export async function writeCashMovement(
  tx: Prisma.TransactionClient,
  input: WriteCashMovementInput,
): Promise<{ id: string }> {
  const required = REQUIRED_NATURE[input.type]
  if (required !== null && input.nature !== required) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `CashMovement inválido: ${input.type} exige nature=${required}, recebeu ${input.nature}.`,
    })
  }
  return tx.cashMovement.create({
    data: {
      tenantId: input.tenantId,
      cashSessionId: input.cashSessionId,
      type: input.type,
      nature: input.nature,
      amount: new Prisma.Decimal(input.amountCents).div(100),
      paymentMethod: input.paymentMethod ?? null,
      paymentMethodId: input.paymentMethodId ?? null,
      description: input.description,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      createdByUserId: input.createdByUserId,
    },
  })
}

/**
 * Calculate available cash (DINHEIRO only) for sangria validation.
 * Formula: initialBalance + sum(INCOME where paymentMethod='dinheiro') - sum(OUTCOME where paymentMethod='dinheiro')
 */
export async function calculateCashOnHand(
  tx: PrismaClient,
  cashSessionId: string
): Promise<number> {
  const session = await tx.cashSession.findUniqueOrThrow({
    where: { id: cashSessionId },
    select: { initialBalance: true },
  })

  const incomeResult = await tx.cashMovement.aggregate({
    where: { cashSessionId, nature: "INCOME", paymentMethod: "dinheiro" },
    _sum: { amount: true },
  })

  const outcomeResult = await tx.cashMovement.aggregate({
    where: { cashSessionId, nature: "OUTCOME", paymentMethod: "dinheiro" },
    _sum: { amount: true },
  })

  const initial = Number(session.initialBalance)
  const income = Number(incomeResult._sum.amount ?? 0)
  const outcome = Number(outcomeResult._sum.amount ?? 0)

  return Math.round((initial + income - outcome) * 100) / 100
}

/**
 * Get summary grouped by payment method for a session.
 */
export async function getPaymentMethodSummary(
  tx: PrismaClient,
  cashSessionId: string
): Promise<Array<{ paymentMethod: string; totalIncome: number; totalOutcome: number; net: number }>> {
  const movements = await tx.cashMovement.findMany({
    where: { cashSessionId },
    select: { paymentMethod: true, nature: true, amount: true },
  })

  const map = new Map<string, { income: number; outcome: number }>()

  for (const m of movements) {
    const method = m.paymentMethod || "outros"
    const entry = map.get(method) || { income: 0, outcome: 0 }
    if (m.nature === "INCOME") {
      entry.income += Number(m.amount)
    } else {
      entry.outcome += Number(m.amount)
    }
    map.set(method, entry)
  }

  return Array.from(map.entries()).map(([method, { income, outcome }]) => ({
    paymentMethod: method,
    totalIncome: Math.round(income * 100) / 100,
    totalOutcome: Math.round(outcome * 100) / 100,
    net: Math.round((income - outcome) * 100) / 100,
  }))
}

export interface AutoCloseResult {
  closedCount: number
  sessions: Array<{ id: string; userId: string; hoursOpen: number }>
}

/**
 * Auto-close abandoned sessions (K3).
 * Idempotent: only closes sessions that are still open and older than maxHours.
 * Runs across ALL tenants (cron context, no RLS).
 */
export async function autoCloseAbandonedSessions(
  tx: PrismaClient,
  maxHours: number = 18
): Promise<AutoCloseResult> {
  const cutoff = new Date(Date.now() - maxHours * 60 * 60 * 1000)

  const openSessions = await tx.cashSession.findMany({
    where: {
      closedAt: null,
      openedAt: { lt: cutoff },
    },
    include: { movements: true },
  })

  const closedSessions: AutoCloseResult["sessions"] = []

  for (const session of openSessions) {
    // Mesmo cálculo do fechamento manual/forçado (dinheiro na gaveta) — fonte
    // única computeCashDrawerCents. Antes usava calculateSessionBalance
    // (INCOME−OUTCOME de qualquer forma), divergindo do manual.
    const calculatedCents = computeCashDrawerCents(
      decimalToCents(session.initialBalance),
      session.movements.map((m) => ({
        nature: m.nature,
        amountCents: decimalToCents(m.amount),
        paymentMethod: m.paymentMethod,
      })),
    )
    const calculatedBalance = calculatedCents / 100
    const hoursOpen = Math.round((Date.now() - session.openedAt.getTime()) / (1000 * 60 * 60))

    await tx.cashSession.update({
      where: { id: session.id },
      data: {
        calculatedBalance: new Prisma.Decimal(calculatedBalance),
        declaredBalance: new Prisma.Decimal(calculatedBalance),
        difference: new Prisma.Decimal(0),
        closeType: "AUTOMATIC",
        closedAt: new Date(),
        verified: false,
      },
    })

    closedSessions.push({ id: session.id, userId: session.userId, hoursOpen })
  }

  return { closedCount: closedSessions.length, sessions: closedSessions }
}
