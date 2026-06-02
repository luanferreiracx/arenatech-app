import Link from "next/link";
import {
  ArrowRight,
  Zap,
  ShieldCheck,
  Wallet,
  Store,
  Banknote,
  Clock,
  TrendingUp,
  QrCode,
  ArrowDownRight,
} from "lucide-react";
import { PdvDepixLogo } from "@/components/branding/pdvdepix-logo";

/*
 * Landing pdvdepix — direcao estetica: "terminal de pagamentos cripto".
 * Fundo escuro (slate-950), grid sutil + glow teal, tipografia display
 * (Bricolage) com numeros em mono (JetBrains). Acento teal->verde da marca
 * vivo sobre o escuro. Server component, estatico.
 */

const TEAL = "#2ec4b6";
const GREEN = "#34d17a";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-teal-300/80">
      <span className="h-px w-8 bg-teal-400/50" />
      {children}
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
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-teal-400/40 hover:bg-white/[0.05]">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-teal-400/20 bg-teal-400/10 text-teal-300">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mb-1.5 font-display text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-400">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <span className="font-mono text-3xl font-bold text-white/15">{n}</span>
      <h3 className="mt-2 mb-1.5 font-display text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-400">{children}</p>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 [&_summary]:cursor-pointer">
      <summary className="flex list-none items-center justify-between font-display font-medium text-white marker:content-['']">
        {q}
        <span className="ml-4 font-mono text-xl text-teal-300 transition group-open:rotate-45">+</span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">{a}</p>
    </details>
  );
}

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-200 antialiased">
      {/* Atmosfera: grid + glows */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 80% 50% at 50% 0%, black, transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full blur-[120px]"
        style={{ background: `radial-gradient(circle, ${TEAL}33, transparent 70%)` }}
      />

      <div className="relative z-10">
        {/* ── Nav ── */}
        <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            {/* logo em fundo escuro: wrapper claro pra contraste */}
            <div className="flex items-center">
              <PdvDepixLogo size={32} withWordmark={false} />
              <span className="ml-2 font-display text-lg font-bold tracking-tight text-white">
                pdv<span className="text-teal-300">depix</span>
              </span>
            </div>
            <div className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
              <a href="#como-funciona" className="transition hover:text-white">Como funciona</a>
              <a href="#vantagens" className="transition hover:text-white">Vantagens</a>
              <a href="#taxas" className="transition hover:text-white">Taxas</a>
              <a href="#faq" className="transition hover:text-white">Dúvidas</a>
            </div>
            <Link
              href="/login"
              className="rounded-lg border border-teal-400/30 bg-teal-400/10 px-4 py-2 text-sm font-medium text-teal-200 transition hover:bg-teal-400/20"
            >
              Entrar
            </Link>
          </nav>
        </header>

        {/* ── Hero ── */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-[1.1fr_0.9fr] md:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-400/5 px-4 py-1.5 font-mono text-xs text-teal-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
              </span>
              liquidação_na_hora
            </div>

            <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-white md:text-6xl">
              Venda em{" "}
              <span style={{ color: TEAL }}>DePix</span>.
              <br />
              Receba em{" "}
              <span style={{ color: GREEN }}>PIX</span> na hora.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-400">
              O PDV cripto que fala a língua do seu caixa. Sem maquininha, sem
              endereço de blockchain, sem prazo de recebível — você vende, o
              cliente paga em DePix e o dinheiro cai como PIX na sua conta.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:shadow-teal-500/40"
                style={{ background: `linear-gradient(135deg, ${TEAL}, ${GREEN})` }}
              >
                Acessar minha conta
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#como-funciona"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3.5 font-medium text-slate-300 transition hover:border-white/30 hover:text-white"
              >
                Ver como funciona
              </a>
            </div>
          </div>

          {/* Ticket visual: R$ -> DePix -> PIX */}
          <div className="relative mx-auto w-full max-w-sm">
            <div
              className="absolute -inset-4 rounded-3xl opacity-20 blur-2xl"
              style={{ background: `linear-gradient(135deg, ${TEAL}, ${GREEN})` }}
            />
            <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-mono text-xs uppercase tracking-widest text-slate-500">venda #0427</span>
                <span className="flex items-center gap-1.5 font-mono text-xs text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> paga
                </span>
              </div>
              <div className="py-6 text-center">
                <div className="font-mono text-sm text-slate-500">total</div>
                <div className="font-mono text-4xl font-bold text-white tabular-nums">R$ 100,00</div>
              </div>
              <div className="space-y-3 font-mono text-sm">
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-4 py-3">
                  <span className="flex items-center gap-2 text-slate-400">
                    <QrCode className="h-4 w-4 text-teal-300" /> cliente paga em DePix
                  </span>
                  <span className="text-teal-300 tabular-nums">+100,00</span>
                </div>
                <div className="flex items-center justify-center text-slate-600">
                  <ArrowDownRight className="h-4 w-4" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-green-400/20 bg-green-400/5 px-4 py-3">
                  <span className="flex items-center gap-2 text-slate-300">
                    <Banknote className="h-4 w-4 text-green-400" /> saque em PIX
                  </span>
                  <span className="font-bold text-green-400 tabular-nums">R$ 97,51</span>
                </div>
              </div>
              <div className="mt-4 text-center font-mono text-[11px] text-slate-600">
                taxa transparente · sem maquininha
              </div>
            </div>
          </div>
        </section>

        {/* ── O que é DePix ── */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <SectionLabel>o que é depix</SectionLabel>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
                O real digital na velocidade da internet.
              </h2>
              <p className="mt-5 leading-relaxed text-slate-400">
                DePix é uma stablecoin lastreada em real, na rede Liquid. Para o
                seu cliente, é tão simples quanto um PIX. Para você, é liquidez
                imediata sem depender de banco, adquirente ou prazo de recebível.
              </p>
              <div className="mt-7 space-y-4">
                {[
                  ["1 DePix = R$ 1,00", "estável, sem volatilidade de cripto"],
                  ["Confirma em segundos", "transferência 24/7, sem horário bancário"],
                  ["Conversão automática", "o pdvdepix transforma tudo em PIX no saque"],
                ].map(([t, d]) => (
                  <div key={t} className="flex items-start gap-4">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-green-400/40 bg-green-400/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                    </div>
                    <div>
                      <div className="font-display font-semibold text-white">{t}</div>
                      <div className="text-sm text-slate-400">{d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Benefit icon={Zap} title="Imediato">
                Sem D+1, sem D+30. O valor entra na carteira no momento da venda.
              </Benefit>
              <Benefit icon={ShieldCheck} title="Estável">
                Lastreado em real. O que você vende por R$ 100 vale R$ 100.
              </Benefit>
              <Benefit icon={Wallet} title="Carteira própria">
                Cada loja tem a sua. A cripto fica invisível para você.
              </Benefit>
              <Benefit icon={Banknote} title="Saque fácil">
                Informe a chave PIX e o valor. Convertemos e pagamos na conta.
              </Benefit>
            </div>
          </div>
        </section>

        {/* ── Como funciona ── */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center">
            <SectionLabel>como funciona</SectionLabel>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
              Da venda ao PIX em quatro passos
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">
              Sem aprender cripto. O pdvdepix cuida do blockchain por baixo dos panos.
            </p>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-4">
            <Step n="01" title="Registre a venda">
              Lance o produto ou serviço no PDV e escolha DePix como pagamento.
            </Step>
            <Step n="02" title="Cliente paga">
              Ele escaneia o QR e paga em DePix — fácil como um PIX comum.
            </Step>
            <Step n="03" title="Cai na carteira">
              O valor entra na carteira da sua loja em segundos, já em reais.
            </Step>
            <Step n="04" title="Saque em PIX">
              Informe sua chave PIX e o valor. Convertemos e pagamos no seu banco.
            </Step>
          </div>
        </section>

        {/* ── Vantagens ── */}
        <section id="vantagens" className="mx-auto max-w-6xl px-6 py-20">
          <SectionLabel>vantagens</SectionLabel>
          <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
            Feito para quem vende no balcão.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            <Benefit icon={Banknote} title="Sem maquininha, sem aluguel">
              Esqueça o POS e suas mensalidades. Roda no aparelho que você já tem.
            </Benefit>
            <Benefit icon={Clock} title="Liquidez no mesmo dia">
              Nada de esperar recebível cair. O caixa gira na velocidade da venda.
            </Benefit>
            <Benefit icon={TrendingUp} title="Taxa menor que cartão">
              Pague menos por transação do que nas bandeiras tradicionais.
            </Benefit>
            <Benefit icon={Store} title="PDV completo">
              Produtos, serviços, estoque, caixa e fiscal num lugar só.
            </Benefit>
            <Benefit icon={ShieldCheck} title="Seguro e auditável">
              Cada transação registrada e rastreável. Você no controle do dinheiro.
            </Benefit>
            <Benefit icon={Zap} title="Comece em minutos">
              Criamos sua carteira automaticamente. É só logar e vender.
            </Benefit>
          </div>
        </section>

        {/* ── Taxas ── */}
        <section id="taxas" className="mx-auto max-w-3xl px-6 py-20">
          <div className="text-center">
            <SectionLabel>taxas</SectionLabel>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
              Transparência sem letra miúda
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-400">
              Você sabe exatamente quanto paga por cada operação.
            </p>
          </div>
          <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="p-7">
                <div className="font-mono text-xs uppercase tracking-widest text-slate-500">entrada · recebimento</div>
                <div className="mt-3 font-mono text-3xl font-bold text-white tabular-nums">
                  R$ 0,99 <span className="text-lg font-medium text-teal-300">+ 1,5%</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">por venda recebida em DePix</p>
              </div>
              <div className="p-7">
                <div className="font-mono text-xs uppercase tracking-widest text-slate-500">saque · depix → pix</div>
                <div className="mt-3 font-mono text-3xl font-bold text-white tabular-nums">
                  R$ 0,99 <span className="text-lg font-medium text-green-400">+ 1,7%</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">por saque convertido para PIX</p>
              </div>
            </div>
            <div className="border-t border-white/10 bg-white/[0.02] p-5 text-center font-mono text-xs text-slate-500">
              exemplo: numa venda de R$ 100,00 você recebe <span className="text-green-400">R$ 97,51</span> na carteira ·
              taxas podem variar conforme o plano
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
          <div className="text-center">
            <SectionLabel>dúvidas</SectionLabel>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
              Perguntas frequentes
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            <Faq q="Preciso entender de cripto para usar?" a="Não. O pdvdepix cuida de toda a parte de blockchain e carteira. Para você, é como receber um PIX: o cliente paga, o valor cai e você saca quando quiser." />
            <Faq q="O dinheiro fica preso em cripto?" a="Não. DePix é lastreado em real (1 DePix = R$ 1,00) e você converte para PIX a qualquer momento, informando sua chave. Sem volatilidade." />
            <Faq q="Em quanto tempo recebo?" a="A venda cai na sua carteira em segundos. O saque para PIX é processado e pago na sua conta bancária de forma rápida." />
            <Faq q="Preciso de maquininha ou hardware?" a="Não. Funciona no celular, tablet ou computador que você já usa. O cliente paga escaneando um QR Code." />
            <Faq q="Quais taxas eu pago?" a="Uma taxa fixa pequena mais um percentual por operação (entrada e saque), sempre exibida antes de confirmar. Sem mensalidade de maquininha." />
            <Faq q="O pdvdepix é só pagamento?" a="Não — é um PDV completo: cadastro de produtos e serviços, controle de estoque, caixa, ordens de serviço e emissão fiscal, com o DePix integrado." />
          </div>
        </section>

        {/* ── CTA final ── */}
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-teal-400/20 px-8 py-16 text-center">
            <div
              aria-hidden
              className="absolute inset-0 opacity-20"
              style={{ background: `radial-gradient(ellipse 60% 80% at 50% 0%, ${TEAL}, transparent)` }}
            />
            <div className="relative">
              <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
                Pronto para receber em PIX vendendo com DePix?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-400">
                Acesse sua conta e comece a operar. Sua carteira já vem pronta.
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 font-semibold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:shadow-teal-500/40"
                style={{ background: `linear-gradient(135deg, ${TEAL}, ${GREEN})` }}
              >
                Entrar no pdvdepix <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-white/5">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-slate-500 md:flex-row">
            <div className="flex items-center gap-2">
              <PdvDepixLogo size={24} withWordmark={false} />
              <span className="font-display font-semibold text-slate-300">
                pdv<span className="text-teal-300">depix</span>
              </span>
            </div>
            <p className="font-mono text-xs">© 2026 pdvdepix · todos os direitos reservados</p>
            <Link href="/login" className="transition hover:text-white">
              Acessar conta
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
