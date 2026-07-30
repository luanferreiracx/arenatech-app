import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { monthRange } from "@/lib/commission/month-range";
import { calcAllowanceBreakdown } from "@/lib/commission/allowance";
import {
  computeCommissionLines,
  summarizeCommissionLines,
  toNumericRules,
  type CommissionEvent,
  type CommissionLine,
  type CommissionSubtotal,
} from "@/lib/commission/compute-lines";
import { rethrowUnlessMissingTable } from "@/lib/commission/collect-events-error";

// Prisma client transacional (tenant-scoped). Tipado como `any` porque o helper
// e chamado tanto de `ctx.withTenant` quanto de `withTenant` — ambos entregam um
// client Prisma equivalente, mas os tipos gerados divergem entre os wrappers.
type Tx = any;

function decimalToNumber(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

/**
 * Carrega flags de categoria/escopo dos produtos em lote (isDevice → aparelho,
 * isPremium → premium). Query unica pelos ids — evita N+1 no loop de itens.
 */
async function loadProductFlags(
  tx: Tx,
  productIds: string[],
): Promise<Map<string, { isDevice: boolean; isPremium: boolean }>> {
  const flags = new Map<string, { isDevice: boolean; isPremium: boolean }>();
  if (productIds.length === 0) return flags;

  const products: Array<{ id: string; isDevice: boolean; isPremium: boolean }> =
    await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, isDevice: true, isPremium: true },
    });
  for (const p of products) {
    flags.set(p.id, { isDevice: p.isDevice, isPremium: p.isPremium });
  }
  return flags;
}

/**
 * Coleta os eventos comissionaveis de um prestador no periodo: vendas proprias
 * (OWN) e — quando o contrato tem regra de participacao — vendas/OS da loja
 * (STORE). Tenant-scoped via `tx`. Fonte unica: usada pela apuracao mensal
 * persistida e pela previa por periodo livre.
 */
export async function collectProviderEvents(
  tx: Tx,
  provider: { id: string; userId: string; profile: string },
  periodStart: Date,
  periodEnd: Date,
  includeStoreSales = false,
  includeStoreServiceOrders = false,
): Promise<CommissionEvent[]> {
  const events: CommissionEvent[] = [];

  // ── SALES ──
  // Base (LBC) = (preco_unit − custo_unit) × qtd, apenas custo do produto.
  // Categoria = Product.isDevice (aparelho/acessorio); escopo = Product.isPremium.
  // Coleta vendas PROPRIAS (sellerId = prestador, origem OWN) e — se o contrato
  // tiver regra de participacao — as vendas da LOJA (de OUTROS, origem STORE).
  try {
    const ownSales = await tx.sale.findMany({
      where: {
        status: "COMPLETED",
        saleDate: { gte: periodStart, lte: periodEnd },
        sellerId: provider.userId,
        deletedAt: null,
      },
      include: { items: true },
    });

    // Participacao na loja: vendas de OUTROS vendedores (exclui as proprias —
    // decisao do dono, evita comissionar a mesma venda 2× na mesma regra).
    const storeSales = includeStoreSales
      ? await tx.sale.findMany({
          where: {
            status: "COMPLETED",
            saleDate: { gte: periodStart, lte: periodEnd },
            sellerId: { not: provider.userId },
            deletedAt: null,
          },
          include: { items: true },
        })
      : [];

    // Batch-load product flags (isDevice/isPremium) — evita N+1, cobre ambos.
    const allSales = [...ownSales, ...storeSales];
    const productIds = Array.from(
      new Set(
        allSales.flatMap((s: { items: Array<{ productId: string }> }) =>
          s.items.map((i) => i.productId),
        ) as string[],
      ),
    );
    const productFlags = await loadProductFlags(tx, productIds);

    const pushSaleEvents = (sale: any, source: "OWN" | "STORE") => {
      for (const item of sale.items) {
        // Item estornado (parcial) tem total=0 — nao comissiona. O estorno zera
        // o total do item; ignora-los aqui mantem o re-calculo correto enquanto a
        // apuracao esta aberta (o estorno automatico so gera reversal apos fechada).
        const grossNet = decimalToNumber(item.total);
        if (grossNet <= 0) continue;

        const unitPrice = decimalToNumber(item.unitPrice);
        const unitCost = decimalToNumber(item.costPrice);
        const qty = item.quantity;
        // Duas bases possiveis; a regra do balde escolhe qual usar:
        //  - lucro (LBC) = (preco − custo) × qtd
        //  - total liquido = o que o cliente pagou pelo item (SaleItem.total)
        const lbc = Math.round(Math.max(0, (unitPrice - unitCost) * qty) * 100) / 100;

        const flags = productFlags.get(item.productId);
        const category = flags?.isDevice ? "produto_aparelho" : "produto_acessorio";
        const scope = flags?.isPremium ? "premium" : "normal";
        const label =
          source === "STORE"
            ? `Venda #${sale.number} (loja) — ${item.description ?? "Item"}`
            : `Venda #${sale.number} — ${item.description ?? "Item"}`;

        events.push({
          tipo: source === "STORE" ? "venda_loja" : "venda",
          referencia_id: sale.id,
          referencia_label: label,
          data: sale.saleDate?.toISOString().split("T")[0] ?? sale.createdAt.toISOString().split("T")[0],
          categoria: category,
          escopo: scope,
          category,
          scope,
          source,
          base: lbc,
          baseProfit: lbc,
          baseGrossNet: grossNet,
          qty,
          detalhe: {
            preco_unitario: unitPrice,
            preco_custo_unitario: unitCost,
            quantidade: qty,
            eh_aparelho: flags?.isDevice ?? false,
            eh_premium: flags?.isPremium ?? false,
          },
        });
      }
    };

    for (const sale of ownSales) pushSaleEvents(sale, "OWN");
    for (const sale of storeSales) pushSaleEvents(sale, "STORE");
  } catch (err) {
    rethrowUnlessMissingTable(err, "vendas");
  }

  // ── SERVICE ORDERS ──
  // Base = valor do SERVICO (serviceAmount), nao o total da OS. O total inclui
  // pecas — comissionar sobre ele pagaria comissao sobre o custo de peca. Com peca:
  // LBS = serviceAmount − (partsCost + otherCost). Sem peca: serviceAmount cheio.
  // OS sempre escopo `normal`. Sem deducao fiscal.
  try {
    const serviceOrders = await tx.serviceOrder.findMany({
      where: {
        status: { in: ["PAID", "DELIVERED"] },
        paymentDate: { gte: periodStart, lte: periodEnd },
        deletedAt: null,
        OR: [{ technicianId: provider.userId }, { vendorId: provider.userId }],
      },
    });

    for (const so of serviceOrders) {
      const serviceAmount = decimalToNumber(so.serviceAmount);
      const partsCost = decimalToNumber(so.partsCost);
      const otherCost = decimalToNumber(so.otherCost);
      const costsTotal = partsCost + otherCost;
      const hasParts = costsTotal > 0;
      const lbs = Math.round((serviceAmount - costsTotal) * 100) / 100;

      const isExecutor = so.technicianId === provider.userId;
      const isIntermediary = so.vendorId === provider.userId;

      // Technician executor: execution commission.
      // Bases DISTINTAS para o eixo base ser configuravel (lucro vs total):
      //   baseProfit = LBS (serviceAmount − custos); baseGrossNet = serviceAmount.
      // O default por categoria preserva o comportamento antigo (com peca=lucro,
      // sem peca=total) via `base` da regra (ver validators/UI).
      if (isExecutor && provider.profile === "TECHNICIAN") {
        const category = hasParts ? "servico_at_com_peca" : "servico_at_sem_peca";

        if (serviceAmount > 0 || lbs > 0) {
          events.push({
            tipo: "servico_execucao",
            referencia_id: so.id,
            referencia_label: `OS #${so.number} (execucao)`,
            data: so.paymentDate?.toISOString().split("T")[0] ?? so.updatedAt.toISOString().split("T")[0],
            categoria: category,
            escopo: "normal",
            category,
            scope: "normal",
            source: "OWN",
            base: lbs,
            baseProfit: lbs,
            baseGrossNet: serviceAmount,
            qty: 1,
            detalhe: {
              valor_servico: serviceAmount,
              custo_total: costsTotal,
              tem_peca: hasParts,
            },
          });
        }
      }

      // Seller intermediary: intermediation commission. Bases distintas tambem.
      if (isIntermediary && provider.profile === "SELLER" && (serviceAmount > 0 || lbs > 0)) {
        events.push({
          tipo: "servico_intermediacao",
          referencia_id: so.id,
          referencia_label: `OS #${so.number} (intermediacao)`,
          data: so.paymentDate?.toISOString().split("T")[0] ?? so.updatedAt.toISOString().split("T")[0],
          categoria: "intermediacao_at",
          escopo: "normal",
          category: "intermediacao_at",
          scope: "normal",
          source: "OWN",
          base: lbs,
          baseProfit: lbs,
          baseGrossNet: serviceAmount,
          qty: 1,
          detalhe: {
            valor_servico: serviceAmount,
            custo_total: costsTotal,
          },
        });
      }
    }
  } catch (err) {
    rethrowUnlessMissingTable(err, "ordens de servico");
  }

  // ── PARTICIPACAO EM AT (OS da loja, de OUTROS tecnicos) ──
  // Analogo ao STORE de vendas: o prestador ganha por OS executada na loja por
  // OUTRO tecnico. So varre quando ha regra da categoria `servico_at_loja`.
  // Base: baseProfit = LBS (serviceAmount − custos); baseGrossNet = serviceAmount.
  // qty = Σ quantidade dos itens SERVICE (fixo "por servico"); fallback 1 se a OS
  // nao itemiza servicos (mao de obra so e cobrada se houve servico — evita R$0).
  if (includeStoreServiceOrders) {
    try {
      const storeOrders = await tx.serviceOrder.findMany({
        where: {
          status: { in: ["PAID", "DELIVERED"] },
          paymentDate: { gte: periodStart, lte: periodEnd },
          deletedAt: null,
          technicianId: { not: provider.userId },
          // Auditoria 2026-07-25: sem este filtro, a OS que o prestador
          // INTERMEDIOU (vendorId = ele) e outro técnico executou gerava DOIS
          // eventos — `intermediacao_at`/OWN e `servico_at_loja`/STORE — em
          // baldes diferentes, somando duas comissões pela MESMA OS.
          // Decisão do dono: quem vendeu ganha pela intermediação e não entra
          // também como participação. Espelha o guard que as VENDAS já tinham
          // (`sellerId: { not: provider.userId }`).
          vendorId: { not: provider.userId },
        },
        include: { items: true },
      });

      for (const so of storeOrders) {
        // Guard extra: technicianId nao-nulo (executor definido) e != prestador.
        if (!so.technicianId || so.technicianId === provider.userId) continue;
        // Espelha o filtro acima na memória (defesa contra vendorId nulo).
        if (so.vendorId && so.vendorId === provider.userId) continue;

        const serviceAmount = decimalToNumber(so.serviceAmount);
        const costsTotal = decimalToNumber(so.partsCost) + decimalToNumber(so.otherCost);
        const lbs = Math.round((serviceAmount - costsTotal) * 100) / 100;
        if (serviceAmount <= 0 && lbs <= 0) continue;

        // qty = numero de servicos (itens type=SERVICE); fallback 1.
        const serviceItemsQty = (so.items ?? [])
          .filter((it: { type: string }) => it.type === "SERVICE")
          .reduce((sum: number, it: { quantity: unknown }) => sum + decimalToNumber(it.quantity as never), 0);
        const qty = serviceItemsQty > 0 ? serviceItemsQty : 1;

        events.push({
          tipo: "servico_loja",
          referencia_id: so.id,
          referencia_label: `OS #${so.number} (participacao)`,
          data: so.paymentDate?.toISOString().split("T")[0] ?? so.updatedAt.toISOString().split("T")[0],
          categoria: "servico_at_loja",
          escopo: "normal",
          category: "servico_at_loja",
          scope: "normal",
          source: "STORE",
          base: lbs,
          baseProfit: lbs,
          baseGrossNet: serviceAmount,
          qty,
          detalhe: {
            valor_servico: serviceAmount,
            custo_total: costsTotal,
            qtd_servicos: qty,
          },
        });
      }
    } catch (err) {
      rethrowUnlessMissingTable(err, "participacao em AT da loja");
    }
  }

  return events;
}

export type CommissionPreview = {
  grossCommission: number;
  lines: CommissionLine[];
  subtotals: Record<string, CommissionSubtotal>;
};

/**
 * Previa de comissao de um prestador num periodo LIVRE — SO comissao, sem ajuda
 * de custo e sem estornos, sem persistir. Resolve o contrato vigente que
 * intersecta o periodo, coleta os eventos e aplica os baldes. Tenant-scoped via
 * `tx`. Compartilhado pela procedure `previewByPeriod` e pela exportacao em PDF.
 */
export async function computeCommissionPreview(
  tx: Tx,
  providerId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<CommissionPreview> {
  const provider = await tx.provider.findUnique({
    where: { id: providerId },
    include: {
      contracts: {
        orderBy: { startDate: "desc" },
        // Ordem ESTÁVEL das regras (auditoria 2026-07-25): o motor lê o modo
        // do balde de `sorted[0]` e o sort por rangeMin empata quando duas
        // regras têm o mesmo piso. Sem `orderBy`, a ordem era a do heap do
        // Postgres — instável após UPDATE/VACUUM — e a MESMA apuração podia
        // mudar sozinha entre dois cálculos.
        include: { rules: { orderBy: [{ rangeMin: "asc" }, { id: "asc" }] } },
      },
    },
  });
  if (!provider) return { grossCommission: 0, lines: [], subtotals: {} };

  // Contrato vigente que intersecta o periodo (mesma regra do recompute mensal).
  const contract = provider.contracts.find((c: { startDate: Date; endDate: Date | null }) => {
    const start = new Date(c.startDate);
    const end = c.endDate ? new Date(c.endDate) : null;
    return start <= periodEnd && (!end || end >= periodStart);
  });
  if (!contract || contract.rules.length === 0) {
    return { grossCommission: 0, lines: [], subtotals: {} };
  }

  const hasStoreSaleRule = contract.rules.some(
    (r: { source: string; category: string }) => r.source === "STORE" && r.category !== "servico_at_loja",
  );
  const hasStoreServiceRule = contract.rules.some((r: { category: string }) => r.category === "servico_at_loja");

  const events = await collectProviderEvents(
    tx,
    provider,
    periodStart,
    periodEnd,
    hasStoreSaleRule,
    hasStoreServiceRule,
  );
  const { lines, grossCommission } = computeCommissionLines(events, toNumericRules(contract.rules));

  return { grossCommission, lines, subtotals: summarizeCommissionLines(lines) };
}

/**
 * C2 (auditoria comissão 2026-07-11): computa (ou recomputa) a apuração do mês —
 * coleta eventos, aplica os baldes, soma estornos/ajuda de custo e PERSISTE
 * grossCommission/netAmount/memoryJson. Extraído de `calculate` para ser
 * reutilizado por `closeApuracao`: antes o fechamento selava o `netAmount`
 * gravado pelo ÚLTIMO calculate — se vendas/OS mudaram (nova venda, estorno)
 * desde então, o PAYABLE saía com valor stale (paga a mais/menos, inclui venda
 * estornada). Agora o close recomputa sob o lock antes de gerar o PAYABLE.
 */
export async function recomputeProviderApuracao(
  tx: Tx,
  tenantId: string,
  providerId: string,
  year: number,
  month: number,
): Promise<{ id: string; grossCommission: number; netAmount: number }> {
  const provider = await tx.provider.findUnique({
    where: { id: providerId },
    include: {
      contracts: {
        orderBy: { startDate: "desc" },
        // Ordem ESTÁVEL das regras (auditoria 2026-07-25): o motor lê o modo
        // do balde de `sorted[0]` e o sort por rangeMin empata quando duas
        // regras têm o mesmo piso. Sem `orderBy`, a ordem era a do heap do
        // Postgres — instável após UPDATE/VACUUM — e a MESMA apuração podia
        // mudar sozinha entre dois cálculos.
        include: { rules: { orderBy: [{ rangeMin: "asc" }, { id: "asc" }] } },
      },
    },
  });
  if (!provider) throw new TRPCError({ code: "NOT_FOUND", message: "Prestador nao encontrado" });

  const { start: periodStart, end: periodEnd, daysInMonth } = monthRange(year, month);
  const contract = provider.contracts.find((c: { startDate: Date; endDate: Date | null }) => {
    const start = new Date(c.startDate);
    const end = c.endDate ? new Date(c.endDate) : null;
    return start <= periodEnd && (!end || end >= periodStart);
  });

  if (!contract || contract.rules.length === 0) {
    // CM-4: o `update` era `{}` — recalcular um período que deixou de ter
    // contrato vigente PRESERVAVA os valores antigos. Como `closeApuracao`
    // recomputa e sela o resultado num PAYABLE, uma apuração de R$ 1.600 cuja
    // vigência do contrato foi editada para fora do mês virava pagamento de
    // R$ 1.600 sem contrato que o sustentasse. "Recalcular" tem que recalcular:
    // sem contrato o resultado é zero, e o aviso vale nos dois caminhos.
    const semContrato = {
      grossCommission: new Prisma.Decimal(0),
      totalReversals: new Prisma.Decimal(0),
      totalAllowance: new Prisma.Decimal(0),
      capReduction: new Prisma.Decimal(0),
      netAmount: new Prisma.Decimal(0),
      memoryJson: {
        linhas: [],
        subtotais: {},
        total_comissao: 0,
        aviso: "Sem contrato vigente",
      } as Prisma.InputJsonValue,
    };
    const apuracao = await tx.providerApuracao.upsert({
      where: { tenantId_providerId_year_month: { tenantId, providerId, year, month } },
      create: { tenantId, providerId, year, month, ...semContrato },
      update: semContrato,
    });
    return { id: apuracao.id, grossCommission: 0, netAmount: 0 };
  }

  const hasStoreSaleRule = contract.rules.some(
    (r: { source: string; category: string }) => r.source === "STORE" && r.category !== "servico_at_loja",
  );
  const hasStoreServiceRule = contract.rules.some((r: { category: string }) => r.category === "servico_at_loja");
  const events = await collectProviderEvents(tx, provider, periodStart, periodEnd, hasStoreSaleRule, hasStoreServiceRule);

  const { lines, grossCommission } = computeCommissionLines(events, toNumericRules(contract.rules));

  const reversals = await tx.providerReversal.findMany({
    where: { providerId, factDate: { gte: periodStart, lte: periodEnd } },
  });
  const totalReversals = Math.round(reversals.reduce((s: number, r: { amount: unknown }) => s + decimalToNumber(r.amount as Prisma.Decimal), 0) * 100) / 100;

  const { total: totalAllowance, capReduction } = await calculateAllowance(
    tx,
    providerId,
    contract,
    periodStart,
    periodEnd,
    daysInMonth,
  );
  const netAmount = Math.round(Math.max(0, grossCommission - totalReversals + totalAllowance) * 100) / 100;

  const memory = {
    prestador_id: provider.id,
    periodo: {
      inicio: periodStart.toISOString().split("T")[0],
      fim: periodEnd.toISOString().split("T")[0],
      label: `${String(month).padStart(2, "0")}/${year}`,
    },
    linhas: lines,
    subtotais_por_categoria: summarizeCommissionLines(lines),
    total_comissao: grossCommission,
  };

  const apuracao = await tx.providerApuracao.upsert({
    where: { tenantId_providerId_year_month: { tenantId, providerId, year, month } },
    create: {
      tenantId, providerId, year, month,
      grossCommission: new Prisma.Decimal(grossCommission),
      totalReversals: new Prisma.Decimal(totalReversals),
      totalAllowance: new Prisma.Decimal(totalAllowance),
      capReduction: new Prisma.Decimal(capReduction),
      netAmount: new Prisma.Decimal(netAmount),
      memoryJson: memory as Prisma.InputJsonValue,
    },
    update: {
      grossCommission: new Prisma.Decimal(grossCommission),
      totalReversals: new Prisma.Decimal(totalReversals),
      totalAllowance: new Prisma.Decimal(totalAllowance),
      capReduction: new Prisma.Decimal(capReduction),
      netAmount: new Prisma.Decimal(netAmount),
      memoryJson: memory as Prisma.InputJsonValue,
    },
  });

  return { id: apuracao.id, grossCommission, netAmount };
}

async function calculateAllowance(
  tx: Tx,
  providerId: string,
  contract: { allowanceCap: Prisma.Decimal | null; dailyMeal: Prisma.Decimal | null; dailyTransport: Prisma.Decimal | null; monthlyCellphone: Prisma.Decimal | null },
  periodStart: Date,
  periodEnd: Date,
  daysInMonth: number,
): Promise<{ total: number; capReduction: number }> {
  const uncoveredDays = await tx.providerUncoveredDay.count({
    where: {
      providerId,
      day: { gte: periodStart, lte: periodEnd },
    },
  });

  // Os campos do contrato sao VALORES DO MES (nao diarias) — ver calcAllowance.
  //
  // CM-1: `daysInMonth` vem de `monthRange`, não de `periodEnd.getDate()`.
  // `periodEnd` é 23:59:59.999 BRT do último dia = 02:59 UTC do 1º do mês
  // seguinte, e `getDate()` lê no fuso do PROCESSO: em produção (container UTC)
  // devolvia **1**. Sem dia descoberto a proporção dava 1/1 e o valor saía certo
  // por acidente; com um único dia descoberto o prestador perdia a ajuda de
  // custo do mês inteiro.
  return calcAllowanceBreakdown({
    meal: decimalToNumber(contract.dailyMeal),
    transport: decimalToNumber(contract.dailyTransport),
    cellphone: decimalToNumber(contract.monthlyCellphone),
    cap: decimalToNumber(contract.allowanceCap),
    daysInMonth,
    uncoveredDays,
  });
}
