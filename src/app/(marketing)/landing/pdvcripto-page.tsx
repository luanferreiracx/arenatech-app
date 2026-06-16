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
import { PdvCriptoLogo } from "@/components/branding/pdvcripto-logo";

const ORANGE = "#f97316";
const YELLOW = "#fbbf24";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-orange-300/80">
      <span className="h-px w-8 bg-orange-400/50" />
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
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-orange-400/40 hover:bg-white/[0.05]">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-orange-400/20 bg-orange-400/10 text-orange-300">
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
        <span className="ml-4 font-mono text-xl text-orange-300 transition group-open:rotate-45">+</span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">{a}</p>
    </details>
  );
}

export function PdvCriptoLandingPage() {
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
        style={{ background: `radial-gradient(circle, ${ORANGE}33, transparent 70%)` }}
      />

      <div className="relative z-10">
        {/* ── Nav ── */}
        <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center">
              <PdvCriptoLogo size={32} withWordmark={false} />
              <span className="ml-2 font-display text-lg font-bold tracking-tight text-white">
                pdv<span className="text-orange-300">cripto</span>
              </span>
            </div>
            <div className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
              <a href="#como-funciona" className="transition hover:text-white">Como funciona</a>
              <a href="#vantagens" className="transition hover:text-white">Vantagens</a>
              <a href="#faq" className="transition hover:text-white">Dúvidas</a>
            </div>
            <Link
              href="/login"
              className="rounded-lg border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-200 transition hover:bg-orange-400/20"
            >
              Entrar
            </Link>
          </nav>
        </header>

        {/* ── Hero ── */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-[1.1fr_0.9fr] md:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/5 px-4 py-1.5 font-mono text-xs text-orange-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400" />
              </span>
              liquidação_na_hora
            </div>

            <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-white md:text-6xl">
              Receba via{" "}
              <span style={{ color: ORANGE }}>PIX</span>,
              <br />
              guarde em{" "}
              <span style={{ color: YELLOW }}>Cripto</span>.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-400">
              O PDV cripto que fala a língua do seu caixa. Sem maquininha, sem
              endereço de blockchain, sem prazo de recebível — o cliente paga em
              PIX, o valor entra como Cripto na sua carteira e você saca de volta
              em PIX quando quiser.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:shadow-orange-500/40"
                style={{ background: `linear-gradient(135deg, ${ORANGE}, ${YELLOW})` }}
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

          {/* Tickets: Depósito (PIX→Cripto) e Saque (Cripto→PIX) */}
          <div className="relative mx-auto w-full max-w-sm space-y-4">
            <div
              className="absolute -inset-4 rounded-3xl opacity-20 blur-2xl"
              style={{ background: `linear-gradient(135deg, ${ORANGE}, ${YELLOW})` }}
            />

            {/* Deposito: cliente paga PIX -> entra Cripto */}
            <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="font-mono text-xs uppercase tracking-widest text-orange-300">depósito</span>
                <span className="flex items-center gap-1.5 font-mono text-xs text-yellow-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" /> recebido
                </span>
              </div>
              <div className="space-y-2.5 pt-4 font-mono text-sm">
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-4 py-3">
                  <span className="flex items-center gap-2 text-slate-300">
                    <QrCode className="h-4 w-4 text-orange-300" /> cliente paga em PIX
                  </span>
                  <span className="text-slate-300 tabular-nums">R$ 100,00</span>
                </div>
                <div className="flex items-center justify-center text-slate-600">
                  <ArrowDownRight className="h-4 w-4" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-orange-400/20 bg-orange-400/5 px-4 py-3">
                  <span className="flex items-center gap-2 text-slate-300">
                    <Wallet className="h-4 w-4 text-orange-300" /> entra como Cripto
                  </span>
                  <span className="font-bold text-orange-300 tabular-nums">na carteira</span>
                </div>
              </div>
            </div>

            {/* Saque: sai Cripto -> vira PIX */}
            <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="font-mono text-xs uppercase tracking-widest text-yellow-400">saque</span>
                <span className="flex items-center gap-1.5 font-mono text-xs text-yellow-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" /> na conta
                </span>
              </div>
              <div className="space-y-2.5 pt-4 font-mono text-sm">
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-4 py-3">
                  <span className="flex items-center gap-2 text-slate-300">
                    <Wallet className="h-4 w-4 text-orange-300" /> sai da carteira Cripto
                  </span>
                  <span className="text-slate-300 tabular-nums">saldo</span>
                </div>
                <div className="flex items-center justify-center text-slate-600">
                  <ArrowDownRight className="h-4 w-4" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-yellow-400/20 bg-yellow-400/5 px-4 py-3">
                  <span className="flex items-center gap-2 text-slate-300">
                    <Banknote className="h-4 w-4 text-yellow-400" /> cai como PIX
                  </span>
                  <span className="font-bold text-yellow-400 tabular-nums">no banco</span>
                </div>
              </div>
            </div>

            <div className="relative text-center font-mono text-[11px] text-slate-600">
              sem maquininha · liquidação imediata
            </div>
          </div>
        </section>

        {/* ── O que é Cripto ── */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <SectionLabel>o que é cripto</SectionLabel>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
                O real digital na velocidade da internet.
              </h2>
              <p className="mt-5 leading-relaxed text-slate-400">
                Cripto é uma stablecoin lastreada em real. O seu
                cliente paga normalmente em PIX; o valor entra como Cripto na sua
                carteira. É liquidez imediata, sem depender de banco, adquirente
                ou prazo de recebível — e você saca de volta em PIX quando quiser.
              </p>
              <div className="mt-7 space-y-4">
                {[
                  ["1 Cripto = R$ 1,00", "estável, sem volatilidade de mercado"],
                  ["Confirma em segundos", "transferência 24/7, sem horário bancário"],
                  ["Conversão automática", "o pdvcripto transforma tudo em PIX no saque"],
                ].map(([t, d]) => (
                  <div key={t} className="flex items-start gap-4">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-yellow-400/40 bg-yellow-400/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
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
              Sem aprender cripto. O pdvcripto cuida do blockchain por baixo dos panos.
            </p>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-4">
            <Step n="01" title="Registre a venda">
              Lance o produto ou serviço no PDV e gere a cobrança.
            </Step>
            <Step n="02" title="Cliente paga em PIX">
              Ele escaneia o QR e paga normalmente em PIX — como já está acostumado.
            </Step>
            <Step n="03" title="Entra como Cripto">
              O valor cai na carteira Cripto da sua loja em segundos (1 Cripto = R$ 1,00).
            </Step>
            <Step n="04" title="Saque em PIX">
              Informe sua chave PIX e o valor. O Cripto sai da carteira e cai como PIX no seu banco.
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

        {/* ── FAQ ── */}
        <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
          <div className="text-center">
            <SectionLabel>dúvidas</SectionLabel>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
              Perguntas frequentes
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            <Faq q="Preciso entender de cripto para usar?" a="Não. O pdvcripto cuida de toda a parte de blockchain e carteira. O cliente paga em PIX normalmente, o valor entra como Cripto na sua carteira e você saca de volta em PIX quando quiser." />
            <Faq q="O cliente precisa ter cripto ou carteira?" a="Não. Ele paga com o PIX do banco dele, como já faz. A conversão para Cripto acontece do seu lado, automaticamente." />
            <Faq q="O dinheiro fica preso em cripto?" a="Não. A stablecoin é lastreada em real (1 Cripto = R$ 1,00) e você converte para PIX a qualquer momento, informando sua chave. Sem volatilidade." />
            <Faq q="Em quanto tempo recebo?" a="O PIX do cliente vira Cripto na sua carteira em segundos. O saque (Cripto → PIX) é processado e pago na sua conta bancária de forma rápida." />
            <Faq q="Preciso de maquininha ou hardware?" a="Não. Funciona no celular, tablet ou computador que você já usa. O cliente paga escaneando um QR Code de PIX." />
            <Faq q="O pdvcripto é só pagamento?" a="Não — é um PDV completo: cadastro de produtos e serviços, controle de estoque, caixa, ordens de serviço e emissão fiscal, com Cripto integrado." />
          </div>
        </section>

        {/* ── CTA final ── */}
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-orange-400/20 px-8 py-16 text-center">
            <div
              aria-hidden
              className="absolute inset-0 opacity-20"
              style={{ background: `radial-gradient(ellipse 60% 80% at 50% 0%, ${ORANGE}, transparent)` }}
            />
            <div className="relative">
              <h2 className="font-display text-3xl font-bold tracking-tight text-white md:text-4xl">
                Pronto para receber em PIX vendendo com Cripto?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-400">
                Acesse sua conta e comece a operar. Sua carteira já vem pronta.
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 font-semibold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:shadow-orange-500/40"
                style={{ background: `linear-gradient(135deg, ${ORANGE}, ${YELLOW})` }}
              >
                Entrar no pdvcripto <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t border-white/5">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-slate-500 md:flex-row">
            <div className="flex items-center gap-2">
              <PdvCriptoLogo size={24} withWordmark={false} />
              <span className="font-display font-semibold text-slate-300">
                pdv<span className="text-orange-300">cripto</span>
              </span>
            </div>
            <p className="font-mono text-xs">© 2026 pdvcripto · todos os direitos reservados</p>
            <Link href="/login" className="transition hover:text-white">
              Acessar conta
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
