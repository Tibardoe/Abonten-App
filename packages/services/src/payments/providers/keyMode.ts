// Test or live, read from a provider key's own prefix. Paystack and Stripe
// both mark their API keys this way (sk_test_ / sk_live_, pk_test_ /
// pk_live_, Stripe's rk_); a Stripe webhook signing secret (whsec_) carries
// no mode and reads as "unknown", as does anything malformed. An unset
// variable is "missing".
//
// Used to refuse an account whose keys are a mix of test and live, whose
// mode is not the one the deployment declares (PAYMENTS_MODE), or which
// holds a live key outside a production deployment — and to report the
// mode on the health check, never the key itself.

export type KeyMode = "test" | "live" | "unknown" | "missing";

export function keyMode(value: string | null | undefined): KeyMode {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return "missing";
  const match = /^(?:sk|pk|rk)_(test|live)_/.exec(trimmed);
  return match ? (match[1] as "test" | "live") : "unknown";
}

/** The deployment's declared payments mode, or null when none is set. */
export function declaredPaymentsMode(
  env: Record<string, string | undefined> = process.env,
): "test" | "live" | null {
  const value = env.PAYMENTS_MODE?.trim().toLowerCase();
  return value === "test" || value === "live" ? value : null;
}

export type AccountModes = {
  secretKey: KeyMode;
  publicKey: KeyMode;
  webhookSecret: KeyMode;
};

export type ModeRules = {
  /** The webhook secret is itself an API key (Paystack), so it has a mode. */
  webhookSecretIsKey: boolean;
  /** VERCEL_ENV of this deployment ("production", "preview", …) or null. */
  deploymentEnv: string | null;
};

/**
 * Why these keys must not be used together, or null. Keys of opposite
 * modes would, for example, open a live checkout that is then verified
 * against the test account; a declared mode stops production from quietly
 * running on test keys (or a test deployment on live ones); and a live key
 * never belongs on a preview or development deployment, whatever variables
 * it was given.
 */
export function accountModeProblem(
  modes: AccountModes,
  declared: "test" | "live" | null,
  rules: ModeRules = { webhookSecretIsKey: true, deploymentEnv: null },
): string | null {
  const known = Object.entries(modes).filter(
    ([, m]) => m === "test" || m === "live",
  );
  const distinct = new Set(known.map(([, m]) => m));
  if (distinct.size > 1) {
    return `keys mix test and live (${known.map(([k, m]) => `${k} ${m}`).join(", ")})`;
  }
  if (
    rules.deploymentEnv &&
    rules.deploymentEnv !== "production" &&
    distinct.has("live")
  ) {
    return `live keys are not allowed on a ${rules.deploymentEnv} deployment`;
  }
  if (!declared) return null;
  if (modes.secretKey === "unknown") {
    return "secret key is not a recognised test or live key";
  }
  if (modes.secretKey !== "missing" && modes.secretKey !== declared) {
    return `secret key is ${modes.secretKey} but PAYMENTS_MODE is ${declared}`;
  }
  if (modes.publicKey === "unknown") {
    return "public key is not a recognised test or live key";
  }
  if (rules.webhookSecretIsKey && modes.webhookSecret === "unknown") {
    return "webhook secret is not a recognised test or live key";
  }
  return null;
}
