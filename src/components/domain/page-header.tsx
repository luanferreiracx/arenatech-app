import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-border pb-4 mb-6", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
      </div>
      {/* `shrink-0` aqui anulava o `flex-wrap` de dentro: o bloco de ações
          crescia até caber tudo numa linha só (medido: 1063px numa viewport de
          390) e empurrava a página inteira para o scroll horizontal. Com
          `min-w-0` o bloco pode encolher e as ações quebram de linha de
          verdade. O `flex-wrap` do pai continua jogando o bloco para a linha de
          baixo quando não couber ao lado do título. */}
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
