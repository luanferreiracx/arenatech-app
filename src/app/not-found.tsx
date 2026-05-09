import Link from "next/link";
import { Logo } from "@/components/branding/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo size="lg" variant="full" />

      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">404</h1>
        <p className="text-lg text-muted-foreground">
          Pagina nao encontrada
        </p>
        <p className="text-sm text-muted-foreground max-w-md">
          A pagina que voce esta procurando nao existe ou foi movida.
        </p>
      </div>

      <Button asChild>
        <Link href="/">Voltar ao inicio</Link>
      </Button>
    </div>
  );
}
