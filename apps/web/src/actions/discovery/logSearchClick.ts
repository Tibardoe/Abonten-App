"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseDiscoveryInput } from "@/utils/discoveryAction";
import { recordSearchClickCore } from "@abonten/services/search/searchCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { searchClickSchema } from "@abonten/validation/discoverySchemas";

/** The first result a searcher opened. Carries no identity; never throws. */
export const logSearchClick = withActionLocale(async function logSearchClick(
  input: unknown,
): Promise<{ status: number }> {
  const parsed = parseDiscoveryInput(searchClickSchema, input);
  if (parsed.error) return { status: 400 };
  try {
    return await recordSearchClickCore(getSupabaseServiceClient(), parsed.data);
  } catch {
    return { status: 500 };
  }
});
