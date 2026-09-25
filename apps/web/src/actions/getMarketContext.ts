"use server";

import { createClient } from "@/config/supabase/server";
import {
  type MarketContextResult,
  getMarketContextCore,
} from "@abonten/services/markets/marketContextCore";
import { cookies, headers } from "next/headers";

/**
 * The viewer's market context for the web app: open markets, the resolved
 * locale context, the display-rate table and the feature flags that apply.
 * `browsingCountry` is the country of the area the person is exploring
 * (when known); the request's IP country and the "country" cookie the
 * proxy keeps are the fallbacks.
 */
export default async function getMarketContext(
  input: {
    browsingCountry?: string | null;
    viewerTimeZone?: string | null;
    viewerLocale?: string | null;
  } = {},
): Promise<MarketContextResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const headerList = await headers();
  const cookieStore = await cookies();
  const requestCountry =
    headerList.get("x-vercel-ip-country") ??
    headerList.get("x-country-code") ??
    cookieStore.get("country")?.value ??
    null;

  return getMarketContextCore({
    supabase,
    userId: user?.id ?? null,
    browsingCountry: input.browsingCountry ?? null,
    requestCountry,
    viewerTimeZone: input.viewerTimeZone ?? null,
    viewerLocale:
      input.viewerLocale ??
      headerList.get("accept-language")?.split(",")[0] ??
      null,
    platform: "web",
  });
}
