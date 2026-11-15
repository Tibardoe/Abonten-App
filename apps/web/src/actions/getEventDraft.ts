"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { fetchEventDraftDetail } from "@abonten/services/events/eventDraftCore";
import { tr } from "@abonten/services/i18n/requestLocale";

export type { EventDraftDetail } from "@abonten/services/events/eventDraftCore";

// Full-payload fetch, used only when the user chooses "Continue" on a
// specific draft. Ownership and expiry are both re-checked in the core.
// Body shared with GET /api/mobile/organizer/event-drafts/[draftId].
export const getEventDraft = withActionLocale(async function getEventDraft(
  draftId: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { status: 500 as const, message: userError.message, data: null };
  }
  if (!user) {
    return {
      status: 401 as const,
      message: tr("userNotAuthenticated"),
      data: null,
    };
  }

  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, "events.manage");
  if (actor.error) return actor.error;

  const result = await fetchEventDraftDetail(
    supabase,
    actor.accountId,
    draftId,
  );

  if (result.status !== 200) {
    return { status: result.status, message: result.message, data: null };
  }

  return { status: 200 as const, message: "OK", data: result.data };
});
