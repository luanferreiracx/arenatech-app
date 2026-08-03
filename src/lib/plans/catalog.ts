/**
 * Catálogo comercial de planos (decisão do dono, 2026-08-02).
 *
 * Fonte única: o seed de desenvolvimento e a migration de produção leem daqui.
 * Sem isso, cadastrar plano em dois lugares vira duas verdades — o padrão que
 * este projeto já pagou sete vezes.
 *
 * `modules` lista só o que foi ESCOLHIDO; os pré-requisitos são expandidos por
 * `withModuleDependencies` na gravação, como o editor de plano faz. Por isso
 * "assistência" cita apenas `service-orders` e ainda assim recebe caixa,
 * estoque, financeiro e clientes.
 *
 * A carteira DePix, o link de cobrança e as configurações NÃO aparecem em plano
 * nenhum: são sempre-ligados (ADR 0061).
 */
import { type ModuleKey, withModuleDependencies } from "@/lib/modules";

export type CatalogPlan = {
  slug: string;
  name: string;
  description: string;
  monthlyPriceReais: number;
  maxUsers: number;
  /** Módulos escolhidos (pré-requisitos entram na expansão). */
  modules: ModuleKey[];
};

export const PLAN_CATALOG: CatalogPlan[] = [
  {
    slug: "assistencia",
    name: "Assistência",
    description:
      "Ordens de serviço com a base para operar: caixa, estoque, financeiro e clientes. " +
      "O PDV entra só para RECEBER o valor da OS — sem venda de balcão.",
    monthlyPriceReais: 149,
    maxUsers: 3,
    modules: ["service-orders"],
  },
  {
    slug: "varejo",
    name: "Varejo",
    description:
      "Venda de balcão no PDV com a base para operar: caixa, estoque, financeiro e clientes, " +
      "mais simulador de parcelamento e avaliação de aparelho. Sem ordens de serviço.",
    monthlyPriceReais: 149,
    maxUsers: 3,
    modules: ["pdv-retail", "tools"],
  },
  {
    slug: "varejo-fiscal",
    name: "Varejo + Fiscal",
    description: "Tudo do Varejo, mais emissão de NF-e e apuração de comissões.",
    monthlyPriceReais: 199,
    maxUsers: 5,
    modules: ["pdv-retail", "tools", "fiscal", "commissions"],
  },
  {
    slug: "completo",
    name: "Completo",
    description:
      "Assistência e varejo juntos, com fiscal, comissões e as ferramentas " +
      "(simulador de parcelamento e avaliação de aparelho).",
    monthlyPriceReais: 279,
    maxUsers: 10,
    modules: ["service-orders", "pdv-retail", "fiscal", "commissions", "tools"],
  },
];

/** Slugs do catálogo — qualquer outro plano no banco é legado. */
export const CATALOG_SLUGS = PLAN_CATALOG.map((plan) => plan.slug);

/** Módulos gravados de um plano do catálogo, já com os pré-requisitos. */
export function catalogPlanModules(plan: CatalogPlan): ModuleKey[] {
  return withModuleDependencies(plan.modules);
}
