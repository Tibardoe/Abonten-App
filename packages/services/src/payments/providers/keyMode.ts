// Test or live, read from a provider key's own prefix. Paystack and Stripe
// both mark their API keys this way (sk_test_ / sk_live_, pk_test_ /
// pk_live_, Stripe's rk_); a Stripe webhook signing secret (whsec_) and
// anything else carries no mode and reads as "unknown".
//
// Used to refuse an account whose keys are a mix of test and live, or whose
// mode is not the one the deployment declares (PAYMENTS_MODE), and to
// report the mode on the health check — never the key itself.

export type KeyMode = "test" | "live" | "unknown";

export function keyMode(value: string | null | undefined): KeyMode {
  const match = /^(?:sk|pk|rk)_(test|live)_/.exec(value?.trim() ?? "");
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

/**
 * Why these keys must not be used together, or null. Keys of opposite
 * modes would, for example, open a live checkout that is then verified
 * against the test account; a declared mode stops production from quietly
 * running on test keys (or a test deployment on live ones).
 */
export function accountModeProblem(
  modes: AccountModes,
  declared: "test" | "live" | null,
): string | null {
  const known = Object.entries(modes).filter(([, m]) => m !== "unknown");
  const distinct = new Set(known.map(([, m]) => m));
  if (distinct.size > 1) {
    return `keys mix test and live (${known.map(([k, m]) => `${k} ${m}`).join(", ")})`;
  }
  if (
    declared &&
    modes.secretKey !== "unknown" &&
    modes.secretKey !== declared
  ) {
    return `secret key is ${modes.secretKey} but PAYMENTS_MODE is ${declared}`;
  }
  return null;
}
