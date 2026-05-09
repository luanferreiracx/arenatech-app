import { createMetadata } from "@/lib/metadata";
import { Logo } from "@/components/branding/logo";

export const metadata = createMetadata("Login");

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden p-4">
      {/* Radial glow background */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(201,165,92,0.08) 0%, transparent 70%)",
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
