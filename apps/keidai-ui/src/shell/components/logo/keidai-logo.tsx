import { useId, type SVGProps } from "react";

export interface KeidaiLogoProps extends SVGProps<SVGSVGElement> {
  /** Pixel size (square). Default 32. */
  size?: number;
  /** "mark" = filled vermillion tile (app icon style, default). "glyph" = bare torii, inherits currentColor — use inline in nav/headers on any background. "platinum" = tile of the Platinum six-band stripes with a white torii. */
  variant?: "mark" | "glyph" | "platinum";
  /** Tile background color. Only applies to variant="mark". */
  background?: string;
  /** Accessible name. Pass "" to render decoratively (aria-hidden). */
  title?: string;
}

const KASAGI_PATH = "M8 21 Q50 33 92 21 L92 27 Q50 39 8 27 Z";

// Platinum stripe tokens, top to bottom. Read via CSS vars so the tile follows the theme tokens.
const PLATINUM_BANDS = [
  "--stripe-green",
  "--stripe-yellow",
  "--stripe-orange",
  "--stripe-red",
  "--stripe-purple",
  "--stripe-blue",
] as const;
// Fixed white ink, the same as the mark, so the torii reads on every stripe.
const PLATINUM_INK = "#ffffff";

/**
 * Keidai mark — a geometric torii gate, standing for the platform's trust
 * boundary (境内, the shrine grounds that enclose the gate).
 *
 * <KeidaiLogo />                          tile favicon/app-icon style
 * <KeidaiLogo variant="glyph" size={20} /> bare glyph for inline nav use
 */
export function KeidaiLogo({
  size = 32,
  variant = "mark",
  background = "#e0552a",
  title = "Keidai",
  ...props
}: KeidaiLogoProps) {
  const clipId = useId();
  const isTile = variant === "mark" || variant === "platinum";
  const glyphFill = variant === "mark" ? "#ffffff" : "currentColor";
  const bandHeight = 100 / PLATINUM_BANDS.length;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {variant === "mark" ? (
        <rect width="100" height="100" rx="22" fill={background} />
      ) : null}
      {variant === "platinum" ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect width="100" height="100" rx="22" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {PLATINUM_BANDS.map((token, index) => (
              <rect
                key={token}
                y={index * bandHeight}
                width="100"
                height={bandHeight + 0.5}
                style={{ fill: `var(${token})` }}
              />
            ))}
          </g>
        </>
      ) : null}
      <g
        fill={variant === "platinum" ? undefined : glyphFill}
        style={variant === "platinum" ? { fill: PLATINUM_INK } : undefined}
        transform={isTile ? "translate(13.5 13.5) scale(0.73)" : undefined}
      >
        <path d={KASAGI_PATH} />
        <rect x="46.5" y="27" width="7" height="15" />
        <rect x="22" y="41" width="56" height="7" />
        <rect x="30" y="29" width="9" height="63" />
        <rect x="61" y="29" width="9" height="63" />
      </g>
    </svg>
  );
}

export default KeidaiLogo;
