"use server";

import {
  assertStepUpFresh,
  currentRequestMeta,
  requireAdmin,
} from "@/lib/adminGuard";
import type { FlagRules } from "@abonten/core/flags/evaluateFlag";
import type { MarketTransition } from "@abonten/core/market/transitions";
import { MARKET_TRANSITIONS } from "@abonten/core/market/transitions";
import {
  type CreateMarketInput,
  type UpdateMarketInput,
  type UpsertPaymentMethodInput,
  type UpsertPayoutMethodInput,
  type UpsertProviderInput,
  type UpsertRegionInput,
  createMarketAdminCore,
  refreshExchangeRatesAdminCore,
  runReadinessAdminCore,
  setExchangeRateConfigAdminCore,
  setManualExchangeRateAdminCore,
  transitionMarketAdminCore,
  updateMarketAdminCore,
  upsertFeatureFlagAdminCore,
  upsertPaymentMethodAdminCore,
  upsertPayoutMethodAdminCore,
  upsertProviderAdminCore,
  upsertRegionAdminCore,
} from "@abonten/services/admin/markets/marketsAdminCore";
import { revalidatePath } from "next/cache";
import { adminError, svc } from "./_shared";

// ── Markets ────────────────────────────────────────────────
// Country configuration is edited by markets.manage; switching a market on
// or off (activate / pause / resume / maintenance) is markets.activate
// behind a fresh step-up, like the finance money paths.

export async function createMarket(input: CreateMarketInput) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await createMarketAdminCore(
      svc(),
      ctx,
      input,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/markets");
    return res;
  } catch (e) {
    return adminError(e, "markets.create");
  }
}

export async function updateMarket(input: UpdateMarketInput) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await updateMarketAdminCore(
      svc(),
      ctx,
      input,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/markets/${input.countryCode}`);
    return { status: res.status, message: res.message };
  } catch (e) {
    return adminError(e, "markets.update");
  }
}

export async function upsertMarketProvider(input: UpsertProviderInput) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await upsertProviderAdminCore(
      svc(),
      ctx,
      input,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/markets/${input.countryCode}`);
    return res;
  } catch (e) {
    return adminError(e, "markets.provider");
  }
}

export async function upsertMarketPaymentMethod(
  input: UpsertPaymentMethodInput,
) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await upsertPaymentMethodAdminCore(
      svc(),
      ctx,
      input,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/markets/${input.countryCode}`);
    return res;
  } catch (e) {
    return adminError(e, "markets.method");
  }
}

export async function upsertMarketPayoutMethod(input: UpsertPayoutMethodInput) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await upsertPayoutMethodAdminCore(
      svc(),
      ctx,
      input,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/markets/${input.countryCode}`);
    return res;
  } catch (e) {
    return adminError(e, "markets.payout");
  }
}

export async function upsertMarketRegion(input: UpsertRegionInput) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await upsertRegionAdminCore(
      svc(),
      ctx,
      input,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/markets/${input.countryCode}`);
    return res;
  } catch (e) {
    return adminError(e, "markets.region");
  }
}

export async function runMarketReadiness(countryCode: string) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await runReadinessAdminCore(
      svc(),
      ctx,
      countryCode,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath(`/markets/${countryCode}`);
    return res;
  } catch (e) {
    return adminError(e, "markets.readiness");
  }
}

export async function transitionMarket(input: {
  countryCode: string;
  transition: MarketTransition;
  reason?: string | null;
}) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    if (MARKET_TRANSITIONS[input.transition]?.stepUp) assertStepUpFresh(ctx);
    const res = await transitionMarketAdminCore(
      svc(),
      ctx,
      input,
      await currentRequestMeta(),
    );
    if (res.status === 200) {
      revalidatePath("/markets");
      revalidatePath(`/markets/${input.countryCode}`);
    }
    return res;
  } catch (e) {
    return adminError(e, "markets.transition");
  }
}

// ── Feature flags ──────────────────────────────────────────

export async function upsertFeatureFlag(input: {
  key: string;
  description?: string;
  enabled: boolean;
  rules: FlagRules | null;
}) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await upsertFeatureFlagAdminCore(
      svc(),
      ctx,
      input,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/markets/flags");
    return res;
  } catch (e) {
    return adminError(e, "markets.flag");
  }
}

// ── Exchange rates ─────────────────────────────────────────

export async function refreshExchangeRates() {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await refreshExchangeRatesAdminCore(
      svc(),
      ctx,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/markets/rates");
    return res;
  } catch (e) {
    return adminError(e, "markets.rates.refresh");
  }
}

export async function setExchangeRateConfig(input: {
  provider: "openexchangerates" | "manual" | "off";
  base?: string;
  appIdEnv?: string;
  refreshUrl?: string | null;
}) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await setExchangeRateConfigAdminCore(
      svc(),
      ctx,
      input,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/markets/rates");
    return res;
  } catch (e) {
    return adminError(e, "markets.rates.configure");
  }
}

export async function setManualExchangeRate(input: {
  base: string;
  quote: string;
  rate: number;
}) {
  try {
    const ctx = await requireAdmin({ redirectOnFail: false });
    const res = await setManualExchangeRateAdminCore(
      svc(),
      ctx,
      input,
      await currentRequestMeta(),
    );
    if (res.status === 200) revalidatePath("/markets/rates");
    return res;
  } catch (e) {
    return adminError(e, "markets.rates.manual");
  }
}
