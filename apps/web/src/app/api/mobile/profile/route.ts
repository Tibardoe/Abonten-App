import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { updateProfileCore } from "@abonten/services/profile/updateProfileCore";

// GET /api/mobile/profile
// The caller's own profile row. Mirrors src/app/api/user-profile/route.tsx
// (the web/cookie equivalent) — the real object is the view
// `user_profile_details` (plural), keyed by `user_id`.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { data, error } = await auth.supabase
      .from("user_profile_details")
      .select("*")
      .eq("user_id", auth.user.id)
      .single();

    if (error || !data) {
      return apiJson({
        status: 404,
        message: tr("userProfileNotFound"),
      });
    }

    // The view has no `website` or `social_links` column, and the app's
    // Edit Profile fills its form from this answer: without them the fields
    // opened empty and the next save wrote "" over the saved values.
    const { data: info } = await auth.supabase
      .from("user_info")
      .select("website, social_links")
      .eq("id", auth.user.id)
      .maybeSingle();

    return apiJson({
      status: 200,
      data: {
        ...data,
        website: info?.website ?? null,
        social_links: info?.social_links ?? null,
      },
    });
  } catch (error) {
    logger.error("mobile GET /profile failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}

// PATCH /api/mobile/profile
// { username?, full_name?, bio?, website?, social_links? }
// Edit Profile in the app: the same service as the website's
// updateUserDetails action. Only these fields are read from the body; the
// photo has its own upload flow. social_links is the whole map
// (network → profile address or @handle, "" for none) and replaces what is
// stored; anything that is not a profile on that network is a 400.
export async function PATCH(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiJson({ status: 400, message: tr("nothingToUpdate") });
    }
    return apiJson(
      await updateProfileCore(auth.supabase, auth.user.id, {
        username: body.username,
        full_name: body.full_name,
        bio: body.bio,
        website: body.website,
        social_links: body.social_links,
      }),
    );
  } catch (error) {
    logger.error("mobile PATCH /profile failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
