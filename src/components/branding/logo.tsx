/**
 * Logo do produto/tenant. Quando o tenant tem logo enviada (Configurações →
 * Geral, servida via /api/storage/*), ela é exibida; senão, cai na marca
 * placeholder Arena Tech.
 */

import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";
type LogoVariant = "full" | "icon" | "monogram";

interface LogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
  /** Logo do tenant ativo (MinIO). Se presente, prevalece sobre o placeholder. */
  tenantLogoUrl?: string | null;
}

const sizeMap: Record<LogoSize, { height: number; textSize: string; iconSize: number }> = {
  sm: { height: 24, textSize: "text-sm", iconSize: 24 },
  md: { height: 32, textSize: "text-base", iconSize: 32 },
  lg: { height: 48, textSize: "text-2xl", iconSize: 48 },
};

export function Logo({ size = "md", variant = "full", className, tenantLogoUrl }: LogoProps) {
  const { height, textSize, iconSize } = sizeMap[size];

  // Logo do tenant: exibe a imagem enviada, contida no slot. O cabeçalho da
  // sidebar tem h-14 (56px), então o logo ocupa boa parte dessa altura (não os
  // 24px do texto placeholder, que deixavam a imagem minúscula). `full` = mais
  // largura (aberto); `icon` = quadrado menor (colapsado). Framing por token
  // (classes Tailwind), sem style inline.
  if (tenantLogoUrl) {
    // sm/md/lg → altura do box do logo-imagem (maior que o texto placeholder).
    const box =
      variant === "icon"
        ? { sm: "h-8 w-8", md: "h-9 w-9", lg: "h-12 w-12" }[size]
        : { sm: "h-9 w-36", md: "h-10 w-44", lg: "h-14 w-56" }[size];
    return (
      <div className={cn("relative shrink-0", box, className)}>
        <Image
          src={tenantLogoUrl}
          alt="Logo"
          fill
          sizes="224px"
          className={cn("object-contain", variant === "icon" ? "object-center" : "object-left")}
          unoptimized
        />
      </div>
    );
  }

  if (variant === "icon") {
    return (
      <div
        className={cn("flex items-center justify-center rounded", className)}
        style={{ width: iconSize, height: iconSize }}
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Arena Tech"
        >
          <rect width="32" height="32" rx="6" fill="#2ec4b6" fillOpacity="0.12" />
          <path
            d="M16 6L26 26H6L16 6Z"
            stroke="#2ec4b6"
            strokeWidth="2"
            strokeLinejoin="round"
            fill="none"
          />
          <line x1="10" y1="20" x2="22" y2="20" stroke="#2ec4b6" strokeWidth="2" />
        </svg>
      </div>
    );
  }

  if (variant === "monogram") {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ height }}
      >
        <span
          className={cn(
            "font-bold tracking-widest text-primary select-none",
            textSize
          )}
          style={{ letterSpacing: "0.15em" }}
        >
          AT
        </span>
      </div>
    );
  }

  // variant === "full"
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      style={{ height }}
    >
      <svg
        width={height}
        height={height}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="6" fill="#2ec4b6" fillOpacity="0.12" />
        <path
          d="M16 6L26 26H6L16 6Z"
          stroke="#2ec4b6"
          strokeWidth="2"
          strokeLinejoin="round"
          fill="none"
        />
        <line x1="10" y1="20" x2="22" y2="20" stroke="#2ec4b6" strokeWidth="2" />
      </svg>
      <span
        className={cn("font-bold text-primary select-none", textSize)}
        style={{ letterSpacing: "0.2em" }}
      >
        ARENA·TECH
      </span>
    </div>
  );
}
