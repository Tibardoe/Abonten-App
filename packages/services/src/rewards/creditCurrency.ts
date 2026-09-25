// Which currency a person's Abonten Credit is in: the currency of their
// credit account once it exists, otherwise their home market's currency,
// otherwise the default market's. Mirrors public._credit_home_currency so
// the copy a screen shows ("GH₵5 welcome credit", "₦500 welcome credit")
// always matches what the ledger will post.

import { logger } from "@abonten/core/logger";
import { getDefaultMarket, getMarketOrDefault } from "../markets/marketConfig";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

export async function creditCurrencyFor(
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return (await getDefaultMarket()).defaultCurrency;
  const service = getSupabaseServiceClient();
  const [account, profile] = await Promise.all([
    service
      .from("credit_account")
      .select("currency")
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("user_info")
      .select("country_code")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  if (account.error || profile.error) {
    logger.warn(
      `creditCurrencyFor(${userId}): ${account.error?.message ?? profile.error?.message}`,
    );
  }
  if (account.data?.currency) return account.data.currency;
  return (await getMarketOrDefault(profile.data?.country_code ?? null))
    .defaultCurrency;
}

/** The currency the reward rules are written in (the default market's until rules exist per market). */
export async function rewardRulesCurrency(): Promise<string> {
  return (await getDefaultMarket()).defaultCurrency;
}
