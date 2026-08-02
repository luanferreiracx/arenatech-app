/**
 * O que cada status de assinatura significa — em UM lugar só (ADR 0061).
 *
 * Antes, a resposta a "este status dá acesso?" era o literal
 * `["ACTIVE", "PAST_DUE"]` copiado em `auth.ts` e em `tenant-plan.service.ts`, e
 * "conta como receita?" era um `=== "ACTIVE"` dentro do cálculo de MRR. Três
 * cópias da mesma regra em três arquivos.
 *
 * Isso importa agora porque `TRIALING` entrou: um trial CONCEDE acesso e NÃO É
 * RECEITA. Com as regras espalhadas, acertar num lugar e esquecer no outro
 * daria um MRR inflado por contas que nunca pagaram — o mesmo padrão de "duas
 * implementações, o endurecimento numa e os usuários na outra" que este projeto
 * já pagou sete vezes.
 */

export const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Status que concedem os módulos do plano.
 *
 * - `TRIALING`: está testando; é o ponto do funil em que ele decide comprar.
 * - `ACTIVE`: pagou.
 * - `PAST_DUE`: venceu mas está na carência — cortar aqui seria cortar antes do
 *   prazo que a gente mesmo prometeu.
 *
 * Exportado como array para virar `where: { status: { in: ... } }` no Prisma sem
 * ninguém reescrever a lista à mão.
 */
export const PLAN_ACCESS_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE"] as const;

/** O status concede os módulos do plano? */
export function grantsPlanAccess(status: string): boolean {
  return (PLAN_ACCESS_STATUSES as readonly string[]).includes(status);
}

/**
 * O status conta como receita recorrente (MRR)?
 *
 * SÓ `ACTIVE`. Trial não é receita: contá-lo infla o MRR com contas que nunca
 * pagaram e transforma a métrica de saúde do negócio em ficção. `PAST_DUE`
 * também fica de fora — é receita que não entrou.
 */
export function countsAsRevenue(status: string): boolean {
  return status === "ACTIVE";
}

/** O status é um teste grátis em andamento? */
export function isTrialing(status: string): boolean {
  return status === "TRIALING";
}
