/**
 * toPublicPlanView: contrato PÚBLICO de um plano (página de preços, endpoint sem
 * auth `admin.publicPlans`). Guard de segurança: NUNCA expõe `features` — que
 * carrega a intenção de gating de módulos (P2 da auditoria 2026-07-14: vazamento
 * do gating num endpoint público). Mesmo que a linha do banco tenha `features`,
 * a view pública tem que dropar.
 */
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { toPublicPlanView } from "@/lib/plans/public-plan-view";

const basePlan = {
  id: "plan-1",
  name: "Completo",
  slug: "completo",
  description: "Tudo incluído",
  monthlyPrice: new Prisma.Decimal("149.90"),
  yearlyPrice: new Prisma.Decimal("1499.00"),
  maxUsers: 10,
  // O banco guarda o gating aqui — a view pública NÃO pode vazar isto.
  features: { modules: ["pdv", "cashier", "financial", "fiscal", "iphone-hunter"] },
};

describe("toPublicPlanView", () => {
  it("expõe só campos públicos e converte preços pra centavos", () => {
    const view = toPublicPlanView(basePlan);
    expect(view).toMatchObject({
      id: "plan-1",
      name: "Completo",
      slug: "completo",
      description: "Tudo incluído",
      monthlyPrice: 14990,
      yearlyPrice: 149900,
      maxUsers: 10,
    });
    // Chaves EXATAS: o teste de shape é o que impede um campo novo de entrar no
    // contrato público sem alguém decidir que ele pode ser público.
    expect(Object.keys(view).sort()).toEqual([
      "description",
      "featured",
      "highlights",
      "id",
      "maxUsers",
      "monthlyPrice",
      "name",
      "slug",
      "yearlyPrice",
    ]);
  });

  it("traz os benefícios de VENDA do catálogo, não os módulos do gating", () => {
    const view = toPublicPlanView(basePlan);
    // O plano do banco tem `iphone-hunter` em `features`; os benefícios vêm do
    // catálogo, escritos à mão. Se um dia alguém derivar `highlights` de
    // `features`, a chave interna aparece aqui e o teste cai.
    expect(view.highlights.length).toBeGreaterThan(0);
    expect(view.highlights.join(" ")).not.toMatch(/iphone-hunter|pdv-retail|service-orders/);
  });

  it("plano LEGADO (fora do catálogo) não inventa benefício nem destaque", () => {
    const view = toPublicPlanView({ ...basePlan, slug: "pro" });
    expect(view.highlights).toEqual([]);
    expect(view.featured).toBe(false);
  });

  it("NUNCA inclui `features`/gating de módulos (guard do vazamento)", () => {
    const view = toPublicPlanView(basePlan) as unknown as Record<string, unknown>;
    expect("features" in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain("iphone-hunter");
    expect(JSON.stringify(view)).not.toContain("modules");
  });

  it("yearlyPrice nulo → null (plano só mensal)", () => {
    const view = toPublicPlanView({ ...basePlan, yearlyPrice: null });
    expect(view.yearlyPrice).toBeNull();
  });
});
