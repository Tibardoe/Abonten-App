// Feature flags with targeting: a flag is on for a request when it is
// enabled and every rule in its targeting matches. Percentage rollouts are
// stable per subject (the same person always lands on the same side) via a
// hash of flag key + subject id, so "Nigeria: 10% → 25% → 100%" only ever
// adds people. Unknown flags and malformed rules evaluate to OFF — a flag
// can never fail open.
//
// The `feature_flag` table holds these; the service caches the whole (small)
// table per process and re-reads it every minute.

export type FlagPlatform = "web" | "ios" | "android" | "admin";

export type FlagRules = {
  /** ISO country codes the flag applies in; empty/absent = everywhere. */
  countries?: string[];
  platforms?: FlagPlatform[];
  /** Cohort names the subject must belong to (any of). */
  cohorts?: string[];
  /** 0–100; percentage of subjects (by stable hash) the flag is on for. */
  percent?: number;
  /** Semver-ish "1.4.0"; the app must be at least this version. */
  minAppVersion?: string;
  /** Explicit subject ids always on (staff testing). */
  allowSubjects?: string[];
};

export type FeatureFlagDefinition = {
  key: string;
  enabled: boolean;
  rules: FlagRules | null;
};

export type FlagContext = {
  countryCode?: string | null;
  platform?: FlagPlatform | null;
  cohorts?: readonly string[] | null;
  /** user id, or an install id for signed-out people. */
  subjectId?: string | null;
  appVersion?: string | null;
};

/** FNV-1a 32-bit — small, fast, stable across runtimes. */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 0–99 bucket for a subject under a flag. */
export function rolloutBucket(flagKey: string, subjectId: string): number {
  return stableHash(`${flagKey}:${subjectId}`) % 100;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function evaluateFlag(
  flag: FeatureFlagDefinition | null | undefined,
  ctx: FlagContext = {},
): boolean {
  if (!flag || !flag.enabled) return false;
  const rules = flag.rules;
  if (!rules || typeof rules !== "object") return true;

  try {
    if (
      rules.allowSubjects?.length &&
      ctx.subjectId &&
      rules.allowSubjects.includes(ctx.subjectId)
    ) {
      return true;
    }
    if (rules.countries?.length) {
      const c = ctx.countryCode?.toUpperCase();
      if (!c || !rules.countries.map((x) => x.toUpperCase()).includes(c))
        return false;
    }
    if (rules.platforms?.length) {
      if (!ctx.platform || !rules.platforms.includes(ctx.platform))
        return false;
    }
    if (rules.cohorts?.length) {
      const mine = ctx.cohorts ?? [];
      if (!rules.cohorts.some((c) => mine.includes(c))) return false;
    }
    if (rules.minAppVersion) {
      if (
        !ctx.appVersion ||
        compareVersions(ctx.appVersion, rules.minAppVersion) < 0
      )
        return false;
    }
    if (typeof rules.percent === "number") {
      const pct = Math.max(0, Math.min(100, rules.percent));
      if (pct <= 0) return false;
      if (pct < 100) {
        if (!ctx.subjectId) return false;
        if (rolloutBucket(flag.key, ctx.subjectId) >= pct) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Evaluates a whole table at once, for a client bootstrap payload. */
export function evaluateFlags(
  flags: readonly FeatureFlagDefinition[],
  ctx: FlagContext,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of flags) out[f.key] = evaluateFlag(f, ctx);
  return out;
}
