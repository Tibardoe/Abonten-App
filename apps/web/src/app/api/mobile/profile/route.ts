import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/profile
// The caller's own profile row. Mirrors src/app/api/user-profile/route.tsx
// (the web/cookie equivalent) — the real object is the view
// `user_profile_details` (plural), keyed by `user_id`.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { data, error } = await auth.supabase
      .from("user_profile_details")
      .select("*")
      .eq("user_id", auth.user.id)
      .single();

    if (error || !data) {
      return apiJson({ status: 404, message: "User profile not found" });
    }

    return apiJson({ status: 200, data });
  } catch (error) {
    logger.error("mobile GET /profile failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
