/**
 * Logo Arena Tech — PLACEHOLDER
 * Substituir pelo logo oficial quando disponível.
 */

import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";
type LogoVariant = "full" | "icon" | "monogram";

interface LogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
}

const sizeMap: Record<LogoSize, { height: number; textSize: string; iconSize: number }> = {
  sm: { height: 24, textSize: "text-sm", iconSize: 24 },
  md: { height: 32, textSize: "text-base", iconSize: 32 },
  lg: { height: 48, textSize: "text-2xl", iconSize: 48 },
};

export function Logo({ size = "md", variant = "full", className }: LogoProps) {
  const { height, textSize, iconSize } = sizeMap[size];

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
          <rect width="32" height="32" rx="6" fill="#c9a55c" fillOpacity="0.12" />
          <path
            d="M16 6L26 26H6L16 6Z"
            stroke="#c9a55c"
            strokeWidth="2"
            strokeLinejoin="round"
            fill="none"
          />
          <line x1="10" y1="20" x2="22" y2="20" stroke="#c9a55c" strokeWidth="2" />
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
        <rect width="32" height="32" rx="6" fill="#c9a55c" fillOpacity="0.12" />
        <path
          d="M16 6L26 26H6L16 6Z"
          stroke="#c9a55c"
          strokeWidth="2"
          strokeLinejoin="round"
          fill="none"
        />
        <line x1="10" y1="20" x2="22" y2="20" stroke="#c9a55c" strokeWidth="2" />
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
