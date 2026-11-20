"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type AddShowPassResult,
  addShowPassCore,
} from "@abonten/services/passes/showPassCore";
import {
  type AddShowPassInput,
  addShowPassSchema,
} from "@abonten/validation/showPassSchemas";

/**
 * Sells a pass on every show of a run still to come
 * (docs/architecture/show-passes.md). Thin wrapper over addShowPassCore,
 * shared with POST /api/mobile/organizer/events/:id/passes.
 */
export default withActionLocale(async function addShowPass(
  input: AddShowPassInput,
): Promise<AddShowPassResult | { status: 400 | 401 | 403; message: string }> {
  const parsed = addShowPassSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, message: tr("invalidRequestBody") };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: tr("userNotAuthenticated") };
  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, "events.manage");
  if (actor.error) return actor.error;
  const result = await addShowPassCore(supabase, actor.accountId, parsed.data);
  if (result.status === 200) revalidateAppPath("/manage/events");
  return result;
});
