import Link from "next/link";
import {
  ArrowRight,
  Zap,
  ShieldCheck,
  Wallet,
  Store,
  Banknote,
  Lock,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { PdvDepixLogo } from "@/components/branding/pdvdepix-logo";

const TEAL = "#2ec4b6";
const GREEN = "#34d17a";

/* ── Pequenos componentes locais (server-only, sem estado) ── */

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div
        className="text-3xl font-bold"
        style={{ background: `linear-gradient(135deg, ${TEAL}, ${GREEN})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
      >
        {value}
      </div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}

function Benefit({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div
        className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: "rgba(46,196,182,0.12)" }}
      >
        <Icon className="h-5 w-5" style={{ color: TEAL }} />
      </div>
      <h3 className="mb-1 font-semibold text-slate-900">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div
        className="absolute -top-4 left-6 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${TEAL}, ${GREEN})` }}
      >
        {n}
      </div>
      <h3 className="mt-2 mb-1 font-semibold text-slate-900">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white p-5 [&_summary]:cursor-pointer">
      <summary className="flex items-center justify-between font-medium text-slate-900 marker:content-['']">
        {q}
        <span className="ml-4 text-slate-400 transition group-open:rotate-45">+</span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{a}</p>
    </details>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <PdvDepixLogo size={34} />
          <div className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#como-funciona" className="hover:text-slate-900">Como funciona</a>
            <a href="#vantagens" className="hover:text-slate-900">Vantagens</a>
            <a href="#taxas" className="hover:text-slate-900">Taxas</a>
            <a href="#faq" className="hover:text-slate-900">Duvidas</a>
          </div>
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${TEAL}, ${GREEN})` }}
          >
            Entrar
          </Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ background: `radial-gradient(60% 50% at 50% 0%, ${TEAL}, transparent)` }}
        />
        <div className="mx-auto max-w-6xl px-6 py-20 text-center md:py-28">
          <div
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium"
            style={{ borderColor: "rgba(46,196,182,0.3)", color: TEAL, background: "rgba(46,196,182,0.06)" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: GREEN }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: GREEN }} />
            </span>
            Liquidacao na hora, direto no seu PIX
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-slate-900 md:text-6xl">
            Aceite{" "}
            <span style={{ color: TEAL }}>DePix</span> no balcao,
            <br className="hidden md:block" /> receba em{" "}
            <span style={{ color: GREEN }}>PIX</span> na hora.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            O PDV cripto que fala a lingua do seu caixa. Sem maquininha, sem
            complicacao com endereco e blockchain — voce vende, o cliente paga em
            DePix e o dinheiro cai como PIX na sua conta.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white shadow-md transition hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${TEAL}, ${GREEN})` }}
            >
              Acessar minha conta <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Ver como funciona
            </a>
          </div>
        </div>
      </section>

      {/* ── Metricas ── */}
      <section className="mx-auto max-w-5xl px-6 pb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard value="na hora" label="da venda ao PIX na conta" />
          <MetricCard value="sem maquininha" label="roda no celular ou no PDV" />
          <MetricCard value="taxa baixa" label="transparente, sem surpresa" />
        </div>
      </section>

      {/* ── O que e DePix ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              O que e DePix?
            </h2>
            <p className="mt-4 leading-relaxed text-slate-600">
              DePix e o real digital que anda na velocidade da internet: uma
              stablecoin lastreada em real, na rede Liquid. Para o seu cliente, e
              tao simples quanto um PIX. Para voce, e liquidez imediata sem
              depender de banco, adquirente ou prazo de recebivel.
            </p>
            <div className="mt-6 space-y-3">
              {[
                "1 DePix = R$ 1,00 — estavel, sem volatilidade de cripto.",
                "Transferencia confirmada em segundos, 24/7.",
                "O pdvdepix converte tudo pra PIX automaticamente no saque.",
              ].map((t) => (
                <div key={t} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: GREEN }} />
                  <span className="text-sm text-slate-700">{t}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Benefit icon={Zap} title="Imediato">
              Sem D+1, sem D+30. O valor entra na sua carteira no momento da venda.
            </Benefit>
            <Benefit icon={ShieldCheck} title="Estavel">
              Lastreado em real. O que voce vende por R$ 100 vale R$ 100.
            </Benefit>
            <Benefit icon={Lock} title="Seu controle">
              Voce decide quando sacar. O dinheiro e seu, na sua conta.
            </Benefit>
            <Benefit icon={Wallet} title="Carteira propria">
              Cada loja tem sua carteira. A cripto fica invisivel pra voce.
            </Benefit>
          </div>
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section id="como-funciona" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            Da venda ao PIX em 4 passos
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            Sem aprender cripto. O pdvdepix cuida do blockchain por baixo dos panos.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-4">
            <Step n={1} title="Registre a venda">
              Lance o produto ou servico no PDV e escolha DePix como forma de pagamento.
            </Step>
            <Step n={2} title="Cliente paga">
              Ele escaneia o QR e paga em DePix — tao facil quanto um PIX comum.
            </Step>
            <Step n={3} title="Cai na carteira">
              O valor entra na carteira da sua loja em segundos, ja em reais (DePix).
            </Step>
            <Step n={4} title="Saque em PIX">
              Informe sua chave PIX e o valor. Convertemos e pagamos no seu banco.
            </Step>
          </div>
        </div>
      </section>

      {/* ── Vantagens ── */}
      <section id="vantagens" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
          Por que vender com pdvdepix
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          <Benefit icon={Banknote} title="Sem maquininha, sem aluguel">
            Esqueca o POS e suas mensalidades. Roda no aparelho que voce ja tem.
          </Benefit>
          <Benefit icon={Clock} title="Liquidez no mesmo dia">
            Nada de esperar o recebivel cair. O caixa gira na velocidade da venda.
          </Benefit>
          <Benefit icon={TrendingUp} title="Taxa menor que cartao">
            Pague menos por transacao do que nas bandeiras tradicionais.
          </Benefit>
          <Benefit icon={Store} title="Feito pro balcao">
            PDV completo: produtos, servicos, estoque, caixa e fiscal num lugar so.
          </Benefit>
          <Benefit icon={ShieldCheck} title="Seguro e auditavel">
            Cada transacao registrada e rastreavel. Voce no controle do seu dinheiro.
          </Benefit>
          <Benefit icon={Zap} title="Simples de comecar">
            Criamos sua carteira automaticamente. E so logar e vender.
          </Benefit>
        </div>
      </section>

      {/* ── Taxas ── */}
      <section id="taxas" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            Taxas transparentes
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
            Sem letra miuda. Voce sabe exatamente quanto paga por cada operacao.
          </p>
          <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-2 gap-px bg-slate-100">
              <div className="bg-white p-6">
                <div className="text-sm font-medium text-slate-500">Entrada (recebimento)</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  R$ 0,99 <span className="text-base font-medium text-slate-400">+ 1,5%</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">por venda recebida em DePix</p>
              </div>
              <div className="bg-white p-6">
                <div className="text-sm font-medium text-slate-500">Saque (DePix → PIX)</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  R$ 0,99 <span className="text-base font-medium text-slate-400">+ 1,7%</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">por saque convertido pra PIX</p>
              </div>
            </div>
            <div className="border-t border-slate-100 bg-slate-50 p-5 text-center text-xs text-slate-500">
              Exemplo: numa venda de R$ 100,00 voce recebe R$ 97,51 na carteira.
              As taxas podem variar conforme o seu plano.
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
          Perguntas frequentes
        </h2>
        <div className="mt-10 space-y-3">
          <Faq
            q="Preciso entender de cripto pra usar?"
            a="Nao. O pdvdepix cuida de toda a parte de blockchain e carteira. Pra voce, e como receber um PIX: o cliente paga, o valor cai e voce saca quando quiser."
          />
          <Faq
            q="O dinheiro fica preso em cripto?"
            a="Nao. DePix e lastreado em real (1 DePix = R$ 1,00) e voce converte pra PIX a qualquer momento, informando sua chave. Sem volatilidade."
          />
          <Faq
            q="Em quanto tempo recebo?"
            a="A venda cai na sua carteira em segundos. O saque pra PIX e processado e pago na sua conta bancaria de forma rapida."
          />
          <Faq
            q="Preciso de maquininha ou hardware?"
            a="Nao. Funciona no celular, tablet ou computador que voce ja usa. O cliente paga escaneando um QR Code."
          />
          <Faq
            q="Quais taxas eu pago?"
            a="Uma taxa fixa pequena mais um percentual por operacao (entrada e saque), sempre exibida antes de confirmar. Sem mensalidade de maquininha."
          />
          <Faq
            q="O pdvdepix e so pagamento?"
            a="Nao — e um PDV completo: cadastro de produtos e servicos, controle de estoque, caixa, ordens de servico e emissao fiscal, com o DePix integrado."
          />
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="px-6 pb-24">
        <div
          className="mx-auto max-w-5xl rounded-3xl px-8 py-14 text-center text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${TEAL}, ${GREEN})` }}
        >
          <h2 className="text-3xl font-bold tracking-tight">
            Pronto pra receber em PIX vendendo com DePix?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/90">
            Acesse sua conta e comece a operar. Sua carteira ja vem pronta.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 shadow-md transition hover:bg-slate-100"
          >
            Entrar no pdvdepix <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-500 md:flex-row">
          <PdvDepixLogo size={26} />
          <p>© {2026} pdvdepix. Todos os direitos reservados.</p>
          <Link href="/login" className="font-medium hover:text-slate-900">
            Acessar conta
          </Link>
        </div>
      </footer>
    </div>
  );
}
