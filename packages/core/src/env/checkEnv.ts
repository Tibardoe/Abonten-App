// Boot-time environment check for the two Next.js apps. Each app declares
// which variables it cannot run without and which it degrades without, and
// calls `checkEnv` once from its instrumentation `register()` hook. The
// result is one structured log line per problem and, in a production
// deployment, a thrown error for a missing required variable, so a
// misconfigured deploy fails at start-up instead of at the first payment.
//
// Framework-free: the caller passes `process.env` (or any record), so this
// is unit-tested without touching the real environment.

export type EnvSpec = {
  /** The app cannot serve traffic without these. */
  required: readonly string[];
  /** The app runs, but a feature silently degrades; worth a warning. */
  recommended?: readonly string[];
};

export type EnvReport = {
  missingRequired: string[];
  missingRecommended: string[];
  ok: boolean;
};

function isSet(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function checkEnv(
  env: Record<string, string | undefined>,
  spec: EnvSpec,
): EnvReport {
  const missingRequired = spec.required.filter((name) => !isSet(env[name]));
  const missingRecommended = (spec.recommended ?? []).filter(
    (name) => !isSet(env[name]),
  );
  return {
    missingRequired,
    missingRecommended,
    ok: missingRequired.length === 0,
  };
}

/**
 * Applies the report: warns for recommended gaps, and for required gaps
 * throws when `strict` (production) or logs an error otherwise. Never prints
 * a value, only names.
 */
export function enforceEnv(
  report: EnvReport,
  options: {
    app: string;
    strict: boolean;
    log: { warn: (msg: string) => void; error: (msg: string) => void };
  },
): void {
  if (report.missingRecommended.length > 0) {
    options.log.warn(
      `[env] ${options.app}: optional configuration missing, features degrade: ${report.missingRecommended.join(", ")}`,
    );
  }
  if (report.missingRequired.length > 0) {
    const message = `[env] ${options.app}: required configuration missing: ${report.missingRequired.join(", ")}`;
    if (options.strict) throw new Error(message);
    options.log.error(message);
  }
}
