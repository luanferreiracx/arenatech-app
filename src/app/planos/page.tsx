import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { trpc } from "@/trpc/server";
import { formatCentsBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Planos e preços | Arena Tech",
  description:
    "Escolha o plano da sua loja: assistência técnica, varejo, fiscal ou completo. Teste grátis, sem cartão de crédito.",
};

/**
 * Página de preços PÚBLICA — a entrada do funil self-service (ADR 0061).
 *
 * Server Component: preço e benefícios são conteúdo estático por requisição, sem
 * estado nem evento. O visitante não precisa baixar JS para comparar planos.
 *
 * Os preços vêm do BANCO (o superadmin edita em /admin/plans) e os benefícios do
 * catálogo em código — junção feita em `toPublicPlanView`. A vitrine nunca lê a
 * lista de módulos: ela é a intenção de gating, e o endpoint público a esconde
 * por construção.
 */
export default async function PlanosPage() {
  const [plans, { trialDays }] = await Promise.all([
    trpc.admin.publicPlans(),
    trpc.admin.publicTrialDays(),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Arena Tech
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            O sistema da sua loja, do orçamento ao caixa
          </h1>
          <p className="mt-4 text-pretty text-muted-foreground">
            Escolha o plano que combina com a sua operação. Todos começam com{" "}
            <strong className="text-foreground">
              {trialDays} {trialDays === 1 ? "dia" : "dias"} grátis
            </strong>
            , sem cartão de crédito.
          </p>
        </div>

        {plans.length === 0 ? (
          // Estado real, não decorativo: se o catálogo não estiver sincronizado
          // com o banco, a página não pode fingir que existem planos.
          <p className="mx-auto mt-12 max-w-md text-center text-sm text-muted-foreground">
            Nossos planos estão sendo atualizados. Fale com a gente pelo WhatsApp
            que a gente te ajuda a escolher.
          </p>
        ) : (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <li key={plan.id} className="min-w-0">
                <PlanCard plan={plan} trialDays={trialDays} />
              </li>
            ))}
          </ul>
        )}

        <section className="mx-auto mt-16 max-w-2xl border-t pt-8 text-center">
          <h2 className="text-lg font-semibold">Perguntas rápidas</h2>
          <dl className="mt-6 space-y-6 text-left text-sm">
            <div>
              <dt className="font-medium">Preciso de cartão para testar?</dt>
              <dd className="mt-1 text-muted-foreground">
                Não. Você se cadastra, escolhe o plano e usa por {trialDays}{" "}
                {trialDays === 1 ? "dia" : "dias"}. Só depois disso a cobrança começa.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Posso trocar de plano depois?</dt>
              <dd className="mt-1 text-muted-foreground">
                Pode, a qualquer momento, pelas configurações da sua loja. Seus dados
                continuam onde estão.
              </dd>
            </div>
            <div>
              <dt className="font-medium">E se eu atrasar o pagamento?</dt>
              <dd className="mt-1 text-muted-foreground">
                A gente avisa antes e depois do vencimento, e ainda há um prazo de
                carência. Nada é apagado — o acesso volta assim que você regulariza.
              </dd>
            </div>
          </dl>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-muted-foreground">
          <span>Arena Tech</span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/legal/termos" className="hover:text-foreground">
              Termos de Uso
            </Link>
            <Link href="/legal/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

type PublicPlan = Awaited<ReturnType<typeof trpc.admin.publicPlans>>[number];

function PlanCard({ plan, trialDays }: { plan: PublicPlan; trialDays: number }) {
  return (
    <article
      className={`flex h-full min-w-0 flex-col rounded-lg border bg-card p-6 ${
        plan.featured ? "border-primary shadow-sm" : "border-border"
      }`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h2 className="min-w-0 break-words text-lg font-semibold">{plan.name}</h2>
        {plan.featured && (
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            Mais completo
          </span>
        )}
      </div>

      {/* `flex-wrap` + `min-w-0`: a 200% de zoom (WCAG 1.4.4) o preço e o "/mês"
          não cabem lado a lado na coluna e estouravam o card para fora da tela —
          medido, não suposto. Deixá-los quebrar é o comportamento certo. */}
      <p className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-1">
        <span className="min-w-0 break-words text-3xl font-bold tabular-nums">
          {formatCentsBRL(plan.monthlyPrice)}
        </span>
        <span className="text-sm text-muted-foreground">/mês</span>
      </p>

      {plan.description && (
        <p className="mt-3 break-words text-sm text-muted-foreground">{plan.description}</p>
      )}

      <ul className="mt-6 flex-1 space-y-2 text-sm">
        {plan.highlights.map((highlight) => (
          <li key={highlight} className="flex min-w-0 items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 break-words">{highlight}</span>
          </li>
        ))}
      </ul>

      <Button asChild className="mt-6 w-full" variant={plan.featured ? "default" : "outline"}>
        {/* O plano escolhido viaja na URL e vira `PreRegistration.planId` no
            cadastro — é o que liga a vitrine ao teste grátis. */}
        {/* `aria-label` com o nome do plano: navegando por teclado ou leitor de
            tela, os quatro botões são literalmente o mesmo texto ("Começar 7
            dias grátis") e a lista de links vira quatro opções indistinguíveis.
            Medido percorrendo a página com Tab. */}
        <Link
          href={`/register?plano=${encodeURIComponent(plan.slug)}`}
          aria-label={`Começar ${trialDays} ${trialDays === 1 ? "dia" : "dias"} grátis no plano ${plan.name}`}
        >
          Começar {trialDays} {trialDays === 1 ? "dia" : "dias"} grátis
        </Link>
      </Button>
    </article>
  );
}
