// Shared "pill" input variant for icon-prefixed search/autocomplete fields
// (header search, landing location search, place picker). Deliberately
// distinct from the boxed `Input` component -- a muted, borderless pill
// reads better with a leading icon -- but centralized here so the handful
// of call sites stay in sync instead of drifting className copies.
export const searchFieldWrapperClassName =
  "bg-muted rounded-lg flex items-center gap-2 py-3 md:py-2 px-3 ring-1 ring-transparent transition-shadow focus-within:ring-ring";

export const searchFieldInputClassName =
  "text-foreground outline-none w-full bg-transparent text-base md:text-sm";
