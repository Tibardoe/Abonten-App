"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type ClaimShowPassResult,
  claimShowPassCore,
} from "@abonten/services/passes/showPassCore";
import {
  type ClaimShowPassInput,
  claimShowPassSchema,
} from "@abonten/validation/showPassSchemas";

/**
 * Uses a pass for one more show of its run: a ticket for that show
 * (docs/architecture/show-passes.md). Shared with
 * POST /api/mobile/tickets/:ticketId/pass.
 */
export default withActionLocale(async function claimShowPass(
  input: ClaimShowPassInput,
): Promise<ClaimShowPassResult | { status: 400 | 401; message: string }> {
  const parsed = claimShowPassSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, message: tr("invalidRequestBody") };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: tr("userNotAuthenticated") };
  const result = await claimShowPassCore(user.id, parsed.data);
  if (result.status === 200) revalidateAppPath("/manage/my-events");
  return result;
});
