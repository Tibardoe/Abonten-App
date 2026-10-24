import { PRODUCTION_SUPABASE_REF } from "@abonten/core/env/productionProject";
import type {
  IdentityMarketConfig,
  IdentityProviderKey,
} from "@abonten/types/identityType";
import { smileIdProvider } from "./smileId";
import type {
  CreateIdentitySessionInput,
  IdentityProviderAdapter,
} from "./types";

// Which provider runs a market's checks. market.identity_config names it;
// IDENTITY_PROVIDER_OVERRIDE=test swaps in the stand-in below, and only on a
// deployment that is neither the production deployment nor pointed at the
// production database, so a misconfigured variable can never approve a real
// person without a real check.

/** True where the stand-in provider may run. */
export function testIdentityProviderAllowed(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.VERCEL_ENV?.trim() === "production") return false;
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL ?? ""} ${env.SUPABASE_URL ?? ""}`;
  return !url.includes(PRODUCTION_SUPABASE_REF);
}

/**
 * A provider with no outside service: its "hosted page" is Abonten's own
 * test page, where the tester picks the verdict. For local and Preview QA
 * only; see testIdentityProviderAllowed.
 */
export const testIdentityProvider: IdentityProviderAdapter = {
  key: "test",
  isConfigured: () => testIdentityProviderAllowed(),
  async createSession(input: CreateIdentitySessionInput) {
    if (!testIdentityProviderAllowed()) {
      return {
        ok: false,
        reason: "not_configured",
        detail: "the test provider is refused here",
      };
    }
    const back = new URL(input.redirectUrl);
    return {
      ok: true,
      url: `${back.origin}/identity/test?v=${input.verificationId}&r=${encodeURIComponent(back.pathname + back.search)}`,
      linkRef: `test_${input.verificationId.replace(/-/g, "")}`,
      expiresAt: input.expiresAt,
    };
  },
  verifyCallback: () => ({
    ok: false,
    reason: "signature",
    detail: "the test provider sends no callbacks",
  }),
  fetchStatus: async () => ({
    ok: false,
    detail: "the test provider has no status API",
  }),
};

const PROVIDERS: Record<IdentityProviderKey, IdentityProviderAdapter> = {
  smile_id: smileIdProvider,
  test: testIdentityProvider,
};

export function identityProviderByKey(
  key: IdentityProviderKey,
): IdentityProviderAdapter {
  return PROVIDERS[key];
}

/** The provider for a market, or null when it has none. */
export function identityProviderFor(
  config: IdentityMarketConfig,
): IdentityProviderAdapter | null {
  if (
    process.env.IDENTITY_PROVIDER_OVERRIDE?.trim() === "test" &&
    testIdentityProviderAllowed()
  ) {
    return testIdentityProvider;
  }
  return config.provider ? PROVIDERS[config.provider] : null;
}
