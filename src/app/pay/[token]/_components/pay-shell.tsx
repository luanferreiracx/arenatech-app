import type { ReactNode } from "react";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

/**
 * Invólucro visual da página pública de pagamento DePix. Identidade do app:
 * deep navy (#020617) + teal (#2ec4b6). O brilho teal e o chip DePix são a
 * assinatura; o resto e disciplinado e focado em confiança.
 */
export function PayShell({
  merchantName,
  children,
}: {
  merchantName: string;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#020617] text-slate-100">
      {/* Atmosfera: halo teal ao fundo, contido. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-[#2ec4b6]/15 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(#2ec4b6_1px,transparent_1px)] [background-size:22px_22px]"
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        <header className="mb-6 flex items-center gap-3">
          <DepixMark />
          <div className="leading-tight">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-slate-400">
              Pagamento para
            </p>
            <p className="text-sm font-semibold text-slate-50">{merchantName}</p>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="mt-8 flex items-center justify-center gap-1.5 text-[0.7rem] text-slate-500">
          <ShieldCheck className="size-3.5" />
          Liquidação na rede Liquid · tokens DePix (Real Digital)
        </footer>
      </div>
    </main>
  );
}

/** Marca circular do DePix (símbolo ₽ do Real Digital sobre teal). */
export function DepixMark({ className }: { className?: string }) {
  return (
    <div
      className={
        "grid size-10 place-content-center rounded-xl bg-gradient-to-br from-[#2ec4b6] to-[#0f766e] text-lg font-bold text-[#020617] shadow-[0_0_24px_-4px_#2ec4b6] " +
        (className ?? "")
      }
      aria-hidden
    >
      &#8383;
    </div>
  );
}

/** Tela de estado terminal (pago / indisponível). */
export function StatusScreen({
  tone,
  title,
  message,
}: {
  tone: "success" | "neutral";
  title: string;
  message: string;
}) {
  const success = tone === "success";
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
      <div
        className={
          "mb-5 grid size-16 place-content-center rounded-full " +
          (success
            ? "bg-[#2ec4b6]/15 text-[#5eead4]"
            : "bg-slate-500/15 text-slate-300")
        }
      >
        {success ? <CheckCircle2 className="size-8" /> : <Clock3 className="size-8" />}
      </div>
      <h1 className="text-lg font-semibold text-slate-50">{title}</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">{message}</p>
    </div>
  );
}
