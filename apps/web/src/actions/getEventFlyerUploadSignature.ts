"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type UploadSignatureResult,
  buildCloudinaryUploadSignature,
} from "@abonten/services/uploads/cloudinaryUploadSignature";

// Authorizes a direct browser -> Cloudinary upload of an event flyer,
// scoped to the caller's own folder, without exposing the API secret. The
// Field Ops event wizard uses this and the service then refuses any flyer
// whose public id is not under `event_flyers/<member id>/`, the same
// ownership check the place photos get.
export default withActionLocale(
  async function getEventFlyerUploadSignature(): Promise<UploadSignatureResult> {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return { status: 401, message: tr("signInToUploadAFlyer") };
    }

    // Managing as a team: the chosen team, if the person's role covers this.

    const actor = await actingFor(user.id, "events.manage");

    if (actor.error) return actor.error;

    return buildCloudinaryUploadSignature(actor.accountId, "event_flyer");
  },
);
