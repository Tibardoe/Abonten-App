import { Dimensions, PixelRatio } from "react-native";

// Device-responsive type sizing — the "moderate scale" technique every
// production RN app (and, in effect, Instagram / Twitter / Airbnb's native
// UIs) uses: a phrase should read at the same *relative* size on a 320dp
// phone and a 430dp phablet, so text tracks the screen width — but only a
// fraction of the raw width ratio is applied, and the multiplier is clamped,
// so nothing ever gets unreadably small or cartoonishly large.
//
// Baseline 390dp ≈ iPhone 14 / a typical modern Android — the width every
// hand-tuned `text-[Npx]` value in the app was eyeballed against, so at that
// width the multiplier is ~1 and sizes are unchanged.

const GUIDELINE_WIDTH = 390;
// Apply half of the width delta (0 = fixed sizes, 1 = full linear scaling).
const FACTOR = 0.5;
const MIN_MULT = 0.94;
const MAX_MULT = 1.12;

let cache = { width: 0, mult: 1 };

function widthMultiplier(): number {
  const { width } = Dimensions.get("window");
  if (width === cache.width) return cache.mult;
  const raw = width / GUIDELINE_WIDTH;
  const moderated = 1 + (raw - 1) * FACTOR;
  const mult = Math.min(MAX_MULT, Math.max(MIN_MULT, moderated));
  cache = { width, mult };
  return mult;
}

/**
 * Map an authored px font size to the size this device should actually
 * render, rounded to a crisp pixel boundary. Used by `AppText` so every
 * piece of text in the app scales together instead of each screen having to
 * remember to do it.
 */
export function scaleFont(size: number): number {
  return PixelRatio.roundToNearestPixel(size * widthMultiplier());
}

/**
 * Cap for OS "larger text" accessibility scaling, passed to every `AppText`.
 * Users can still enlarge text, but not so far that card / row / header
 * layouts break — the same trade-off Instagram and Twitter make. A caller
 * can override per-Text via the `maxFontSizeMultiplier` prop.
 */
export const MAX_FONT_SIZE_MULTIPLIER = 1.4;
