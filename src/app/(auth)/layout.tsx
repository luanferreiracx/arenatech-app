import type { ReactNode } from "react";
import { headers } from "next/headers";
import { createMetadata } from "@/lib/metadata";
import { Logo } from "@/components/branding/logo";
import { PdvDepixLogo } from "@/components/branding/pdvdepix-logo";
import { isLandingHost } from "@/lib/brand-host";

export const metadata = createMetadata("Login");

const PDVDEPIX_TEAL = "#2ec4b6";
const PDVDEPIX_GREEN = "#34d17a";

type AuthLayoutProps = {
  children: ReactNode;
};

function ArenaAuthShell({ children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden p-4 antialiased">
      {/* Radial glow background */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(46,196,182,0.08) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Logo above card */}
        <div className="flex justify-center">
          <Logo size="lg" variant="full" />
        </div>

        {/* Card with glassmorphism */}
        <div className="rounded-xl border border-border bg-card/80 backdrop-blur-md shadow-xl">
          {children}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Arena Tech. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}

function PdvDepixAuthShell({ children }: AuthLayoutProps) {
  return (
    <div className="pdvdepix-auth-theme relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 text-slate-100 antialiased">
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
        style={{ background: `radial-gradient(circle, ${PDVDEPIX_TEAL}33, transparent 70%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed right-[-160px] bottom-[-180px] h-[420px] w-[520px] rounded-full blur-[120px]"
        style={{ background: `radial-gradient(circle, ${PDVDEPIX_GREEN}22, transparent 70%)` }}
      />

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="flex items-center">
            <PdvDepixLogo size={40} withWordmark={false} />
            <span className="ml-2 font-display text-xl font-bold tracking-tight text-white">
              pdv<span className="text-teal-300">depix</span>
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/85 shadow-2xl shadow-teal-950/30 backdrop-blur-xl">
          {children}
        </div>

        <p className="text-center font-mono text-[11px] text-slate-500">
          &copy; {new Date().getFullYear()} pdvdepix · todos os direitos reservados
        </p>
      </div>
    </div>
  );
}

export default async function AuthLayout({ children }: AuthLayoutProps) {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");

  if (isLandingHost(host)) {
    return <PdvDepixAuthShell>{children}</PdvDepixAuthShell>;
  }

  return <ArenaAuthShell>{children}</ArenaAuthShell>;
}
