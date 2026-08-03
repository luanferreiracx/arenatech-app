/**
 * Contrato PÚBLICO de um plano — o que o endpoint sem auth `admin.publicPlans`
 * (página de preços) pode expor a qualquer visitante.
 *
 * Guard de segurança (auditoria 2026-07-14, P2): o campo `features` do Plan
 * carrega a INTENÇÃO DE GATING de módulos (quais módulos o plano libera). Expor
 * isso publicamente vaza a estrutura interna de gating. Esta view é um allowlist
 * EXPLÍCITO de campos públicos — `features` fica de fora por construção, e o tipo
 * de retorno não tem o campo, então o TypeScript impede reintroduzi-lo.
 */
import type { Prisma } from "@prisma/client";
import { catalogPlanBySlug } from "./catalog";

export interface PublicPlanView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Preço mensal em centavos. */
  monthlyPrice: number;
  /** Preço anual em centavos, ou null se o plano é só mensal. */
  yearlyPrice: number | null;
  maxUsers: number | null;
  /**
   * Benefícios exibidos na página de preços. Vêm do CATÁLOGO (texto de venda
   * escrito à mão), nunca de `features` — ver o comentário de `highlights` em
   * `lib/plans/catalog`. Plano legado, fora do catálogo, vem com lista vazia.
   */
  highlights: string[];
  /** Plano em destaque na página de preços. */
  featured: boolean;
}

/** Subconjunto do Plan que a view pública consome. `features` NÃO entra. */
export interface PublicPlanInput {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPrice: Prisma.Decimal;
  yearlyPrice: Prisma.Decimal | null;
  maxUsers: number | null;
}

function toCents(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

export function toPublicPlanView(plan: PublicPlanInput): PublicPlanView {
  // Preço/nome/limite vêm do BANCO (o superadmin edita em /admin/plans); os
  // benefícios vêm do catálogo em código. Cada campo tem um dono só.
  const catalog = catalogPlanBySlug(plan.slug);
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    monthlyPrice: toCents(plan.monthlyPrice),
    yearlyPrice: plan.yearlyPrice != null ? toCents(plan.yearlyPrice) : null,
    maxUsers: plan.maxUsers,
    highlights: catalog?.highlights ?? [],
    featured: catalog?.featured === true,
  };
}
