"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type GetShowPassResult,
  getShowPassCore,
} from "@abonten/services/passes/showPassCore";

/**
 * The pass a ticket carries, for its holder: the run's shows and which are
 * chosen (docs/architecture/show-passes.md). Shared with
 * GET /api/mobile/tickets/:ticketId/pass.
 */
export default withActionLocale(async function getShowPass(
  ticketId: string,
): Promise<GetShowPassResult | { status: 401; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: tr("userNotAuthenticated") };
  return getShowPassCore(user.id, ticketId);
});
