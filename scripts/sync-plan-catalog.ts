/**
 * Sincroniza os planos do catálogo comercial com o banco. Idempotente.
 *
 *   DATABASE_URL=... pnpm tsx scripts/sync-plan-catalog.ts          # mostra o plano de ação
 *   DATABASE_URL=... pnpm tsx scripts/sync-plan-catalog.ts --apply  # grava
 *
 * Por que script e não migration: migration é um retrato imutável do passado, e
 * preço/limite de plano muda. Aqui a fonte é `lib/plans/catalog` — a mesma que o
 * seed usa —, então dev e produção não divergem. Depois de criado, o superadmin
 * ajusta em /admin/plans e o script não sobrescreve o que ele mexeu (ver abaixo).
 *
 * Plano fora do catálogo é INATIVADO, nunca apagado: a FK das assinaturas é
 * `Restrict`, e um cliente que já paga continua apontando pro plano dele.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PLAN_CATALOG, CATALOG_SLUGS, catalogPlanModules } from "../src/lib/plans/catalog";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const apply = process.argv.includes("--apply");

async function main(): Promise<void> {
  const existing = await prisma.plan.findMany({
    select: { id: true, slug: true, name: true, status: true },
  });
  const bySlug = new Map(existing.map((plan) => [plan.slug, plan]));

  for (const plan of PLAN_CATALOG) {
    const modules = catalogPlanModules(plan);
    const found = bySlug.get(plan.slug);
    const data = {
      name: plan.name,
      description: plan.description,
      monthlyPrice: plan.monthlyPriceReais,
      maxUsers: plan.maxUsers,
      // Consultas IMEI foram aposentadas; a cota deixou de significar algo.
      maxImeiQueries: 0,
      status: "ACTIVE" as const,
      features: { modules },
    };

    if (!found) {
      console.log(`CRIAR   ${plan.slug.padEnd(15)} R$ ${plan.monthlyPriceReais} · ${plan.maxUsers} usuários`);
      console.log(`        módulos: ${modules.sort().join(", ")}`);
      if (apply) await prisma.plan.create({ data: { slug: plan.slug, ...data } });
      continue;
    }

    // Plano que já existe: só os MÓDULOS e o status são realinhados. Preço,
    // nome e limite ficam como o superadmin deixou — sobrescrever seria desfazer
    // a decisão comercial dele a cada execução do script.
    console.log(`ALINHAR ${plan.slug.padEnd(15)} (mantém preço/nome/limite atuais)`);
    console.log(`        módulos: ${modules.sort().join(", ")}`);
    if (apply) {
      await prisma.plan.update({
        where: { slug: plan.slug },
        data: { status: "ACTIVE", features: { modules } },
      });
    }
  }

  const legacy = existing.filter(
    (plan) => !CATALOG_SLUGS.includes(plan.slug) && plan.status === "ACTIVE",
  );
  for (const plan of legacy) {
    const subs = await prisma.subscription.count({ where: { planId: plan.id } });
    console.log(
      `INATIVAR ${plan.slug.padEnd(14)} "${plan.name}"` +
        (subs > 0 ? ` — ${subs} assinatura(s) seguem nele e continuam funcionando` : ""),
    );
  }
  if (apply && legacy.length > 0) {
    await prisma.plan.updateMany({
      where: { id: { in: legacy.map((plan) => plan.id) } },
      data: { status: "INACTIVE" },
    });
  }

  console.log(apply ? "\nAplicado." : "\nNada gravado. Rode com --apply para aplicar.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
