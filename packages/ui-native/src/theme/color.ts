// Small colour helpers for the native theme. The semantic tokens resolve to
// `hsl(H S% L%)` strings (see resolveScheme); NativeWind's `/opacity`
// modifiers don't work on them because the triples carry no `<alpha-value>`
// slot. These helpers let JS-driven surfaces (status pills, tinted cards,
// chart fills) build a soft translucent wash from the very same token so the
// result tracks light/dark automatically.

/** Parse an `hsl(H S% L%)` / `hsl(H, S%, L%)` string into its three numbers. */
export function parseHsl(
  input: string,
): { h: number; s: number; l: number } | null {
  const m = input
    .trim()
    .match(/^hsl\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*\)$/i);
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/**
 * Return the colour as an `hsla(...)` string with the given alpha (0..1).
 * Falls back to the input unchanged if it isn't an `hsl(...)` triple.
 */
export function withAlpha(color: string, alpha: number): string {
  const parsed = parseHsl(color);
  if (!parsed) return color;
  const a = Math.min(1, Math.max(0, alpha));
  return `hsla(${parsed.h}, ${parsed.s}%, ${parsed.l}%, ${a})`;
}

/**
 * A soft tinted background for a status/label chip, derived from its accent
 * colour. Alpha is intentionally low so text and icon in the same hue stay
 * the load-bearing signal (this project's "never colour alone" rule).
 */
export function tintBackground(
  color: string,
  scheme: "light" | "dark",
): string {
  return withAlpha(color, scheme === "dark" ? 0.22 : 0.12);
}

/** A slightly stronger version of the same tint, for a hairline border. */
export function tintBorder(color: string, scheme: "light" | "dark"): string {
  return withAlpha(color, scheme === "dark" ? 0.4 : 0.24);
}

/**
 * The colour as an `rgb(r, g, b)` string. For consumers that parse colours
 * themselves instead of handing them to the native layer (React
 * Navigation's theme is run through the `color` library, which does not
 * read the space-separated `hsl(H S% L%)` form every token uses). Falls
 * back to the input unchanged if it isn't an `hsl(...)` triple.
 */
export function toRgb(color: string): string {
  const parsed = parseHsl(color);
  if (!parsed) return color;
  const s = parsed.s / 100;
  const l = parsed.l / 100;
  const k = (n: number) => (n + parsed.h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(
      255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))),
    );
  return `rgb(${f(0)}, ${f(8)}, ${f(4)})`;
}
