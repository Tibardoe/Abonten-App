export const dynamic = "force-dynamic";

import { getPlaceClaimRequests } from "@/actions/getPlaceClaimRequests";
import { createClient } from "@/config/supabase/server";
import AdminPlaceClaimsList from "./AdminPlaceClaimsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

/**
 * The only admin page in the app (Places Phase 2, Milestone 2) -- lists
 * pending place_claim_request rows for approval/rejection. Server
 * Component gate checks user_info.is_admin directly here (same
 * fetch-then-compare shape manage/places/[placeId]/page.tsx uses for
 * owner_id), rather than relying on hidden UI alone -- this route must
 * actually enforce the check server-side. proxy.ts's public-route
 * allowlist does not include /admin, so any signed-out visitor is already
 * redirected to sign-in before this component even runs; the is_admin
 * check below is the additional requirement on top of that.
 */
export default async function page() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        Sign in to view this page.
      </p>
    );
  }

  const { data: userInfo } = await supabase
    .from("user_info")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!userInfo?.is_admin) {
    return (
      <p className="p-8 text-center text-muted-foreground">
        You're not authorized to view this page.
      </p>
    );
  }

  const firstPage = await getPlaceClaimRequests();

  async function fetchPage(cursor: string | null) {
    "use server";
    return getPlaceClaimRequests({ cursor });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
      <h1 className="font-bold text-xl">Place Claim Requests</h1>

      <AdminPlaceClaimsList initialPage={firstPage} fetchPage={fetchPage} />
    </div>
  );
}
