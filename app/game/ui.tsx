import type { CardType } from "./engine";

type IconProps = {
  className?: string;
};

export const SkullIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M32 6c-11.6 0-21 9.4-21 21 0 7.6 4 14.3 10 18v6.5c0 3.1 2.6 5.7 5.7 5.7h10.6c3.1 0 5.7-2.6 5.7-5.7V45c6-3.7 10-10.4 10-18 0-11.6-9.4-21-21-21Z"
      stroke="currentColor"
      strokeWidth="3"
    />
    <circle cx="24" cy="30" r="4.5" fill="currentColor" />
    <circle cx="40" cy="30" r="4.5" fill="currentColor" />
    <path
      d="M24 47c2.4 2.5 5.1 3.8 8 3.8s5.6-1.3 8-3.8"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

export const RoseIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M32 12c6.5 0 12 5.3 12 12 0 6.6-5.5 12-12 12-6.7 0-12-5.4-12-12 0-6.7 5.3-12 12-12Z"
      stroke="currentColor"
      strokeWidth="3"
    />
    <path
      d="M32 36c-9.3 0-17 6.7-17 15.5V56h34v-4.5C49 42.7 41.3 36 32 36Z"
      stroke="currentColor"
      strokeWidth="3"
    />
    <path
      d="M32 8v6M14 26h6M44 26h6"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

type CardProps = {
  card: CardType;
  revealed?: boolean;
  className?: string;
};

export const FlipCard = ({ card, revealed = false, className }: CardProps) => (
  <div className={`card ${revealed ? "flipped" : ""} ${className ?? ""}`}>
    <div className="card-inner">
      <div className="card-face card-back">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-[10px] uppercase tracking-[0.35em] text-white/70">
            Skull & Roses
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/90">
            Coaster
          </span>
        </div>
      </div>
      <div className="card-face card-front">
        {card === "skull" ? (
          <SkullIcon className="h-12 w-12 text-[#3a1d1d]" />
        ) : (
          <RoseIcon className="h-12 w-12 text-[#a23643]" />
        )}
        <span className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#3a1d1d]">
          {card}
        </span>
      </div>
    </div>
  </div>
);

type ScorePipProps = {
  filled?: boolean;
};

export const ScorePip = ({ filled = false }: ScorePipProps) => (
  <span
    className={`h-2.5 w-2.5 rounded-full border ${
      filled
        ? "bg-[var(--accent-2)] border-transparent shadow-sm"
        : "border-white/30"
    }`}
  />
);
