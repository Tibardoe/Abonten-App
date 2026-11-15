import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { canUploadContentMedia } from "@abonten/services/content/contentMediaCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import {
  buildCloudinaryUploadSignature,
  isUploadSignatureKind,
} from "@abonten/services/uploads/cloudinaryUploadSignature";

// POST /api/mobile/uploads/signature  { "kind": "avatar" | "highlight" | ... }
// Returns a short-lived Cloudinary signature scoped to `<prefix>/<user id>`.
// Same helper the web get*UploadSignature Server Actions use.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      kind?: unknown;
    } | null;

    if (!isUploadSignatureKind(body?.kind)) {
      return apiJson({
        status: 400,
        message: tr("kindMustBeOneOfAvatar"),
      });
    }

    // Spotlight / Story uploads only for people who could post them.
    if (
      body.kind === "content" &&
      !(await canUploadContentMedia(getSupabaseServiceClient(), auth.user.id))
    ) {
      return apiJson({
        status: 403,
        message: tr("postingIsnTAvailableForYour"),
      });
    }

    // A flyer or a place photo goes in the folder of the account the
    // listing belongs to: the team's when managing as one (the write then
    // checks the folder against that account), the person's otherwise.
    let folderOwner = auth.user.id;
    if (body.kind === "event_flyer" || body.kind === "place_photo") {
      const actor = await mobileActingFor(
        req,
        auth.user.id,
        body.kind === "event_flyer" ? "events.manage" : "places.manage",
      );
      if (actor.error) return apiJson(actor.error);
      folderOwner = actor.accountId;
    }

    return apiJson(
      await buildCloudinaryUploadSignature(folderOwner, body.kind),
    );
  } catch (error) {
    logger.error("mobile POST /uploads/signature failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
