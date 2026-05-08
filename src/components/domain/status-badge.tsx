import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border",
  {
    variants: {
      variant: {
        default: "bg-secondary/10 border-secondary/30 text-secondary-foreground",
        success: "bg-success/10 border-success/30 text-success dark:text-success",
        warning: "bg-warning/10 border-warning/30 text-warning",
        destructive: "bg-destructive/10 border-destructive/30 text-destructive",
        info: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type StatusVariant = "default" | "success" | "warning" | "destructive" | "info";

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  variant?: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ variant }), className)}>{children}</span>
  );
}
