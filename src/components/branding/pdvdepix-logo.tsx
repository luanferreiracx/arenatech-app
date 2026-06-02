/**
 * Logo pdvdepix — usada na landing publica do dominio pdvdepix.app.
 *
 * Recriacao fiel (SVG) da marca: "P" arredondado com duas setas formando um
 * loop de troca (swap) ao redor de um losango central, em gradiente teal->verde.
 * Substituir por asset oficial (public/pdvdepix-logo.svg) quando disponivel.
 */

import { cn } from "@/lib/utils";

interface PdvDepixLogoProps {
  /** altura do icone em px */
  size?: number;
  /** mostra o wordmark "pdvdepix" ao lado/abaixo */
  withWordmark?: boolean;
  /** wordmark abaixo do icone (vertical) em vez de ao lado */
  stacked?: boolean;
  className?: string;
}

const TEAL = "#2ec4b6";
const GREEN = "#34d17a";
const INK = "#1f2a37";

export function PdvDepixLogo({
  size = 40,
  withWordmark = true,
  stacked = false,
  className,
}: PdvDepixLogoProps) {
  return (
    <div
      className={cn(
        "flex select-none",
        stacked ? "flex-col items-center gap-2" : "items-center gap-3",
        className,
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="pdvdepix"
        role="img"
      >
        <defs>
          <linearGradient id="pdvdepix-grad" x1="14" y1="6" x2="50" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={TEAL} />
            <stop offset="1" stopColor={GREEN} />
          </linearGradient>
        </defs>
        {/* Haste + curva do "P" */}
        <path
          d="M20 56 V16 a8 8 0 0 1 8 -8 h10 a14 14 0 0 1 0 28 h-6"
          stroke="url(#pdvdepix-grad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Seta superior (->) */}
        <path
          d="M22 22 h16 m-5 -5 l5 5 l-5 5"
          stroke="url(#pdvdepix-grad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Seta inferior (<-) */}
        <path
          d="M40 42 h-16 m5 -5 l-5 5 l5 5"
          stroke="url(#pdvdepix-grad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Losango central */}
        <rect
          x="27.5"
          y="27.5"
          width="9"
          height="9"
          rx="2"
          transform="rotate(45 32 32)"
          fill="url(#pdvdepix-grad)"
        />
      </svg>

      {withWordmark && (
        <span
          className="font-semibold tracking-tight"
          style={{ fontSize: size * 0.62, lineHeight: 1 }}
        >
          <span style={{ color: INK }}>pdvde</span>
          <span style={{ color: GREEN }}>pix</span>
        </span>
      )}
    </div>
  );
}
