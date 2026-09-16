import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { canUploadContentMedia } from "@abonten/services/content/contentMediaCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import {
  buildCloudinaryUploadSignature,
  isUploadSignatureKind,
} from "@abonten/services/uploads/cloudinaryUploadSignature";

// POST /api/mobile/uploads/signature  { "kind": "avatar" | "highlight" | ... }
// Returns a short-lived Cloudinary signature scoped to `<prefix>/<user id>`.
// Same helper the web get*UploadSignature Server Actions use.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      kind?: unknown;
    } | null;

    if (!isUploadSignatureKind(body?.kind)) {
      return apiJson({
        status: 400,
        message:
          "kind must be one of: avatar, highlight, content, place_photo, event_flyer, event_review_photo, place_review_photo",
      });
    }

    // Spotlight / Story uploads only for people who could post them.
    if (
      body.kind === "content" &&
      !(await canUploadContentMedia(getSupabaseServiceClient(), auth.user.id))
    ) {
      return apiJson({
        status: 403,
        message: "Posting isn't available for your account.",
      });
    }

    return apiJson(
      await buildCloudinaryUploadSignature(auth.user.id, body.kind),
    );
  } catch (error) {
    logger.error("mobile POST /uploads/signature failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
