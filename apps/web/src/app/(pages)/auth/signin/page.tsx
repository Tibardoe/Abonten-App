import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import AuthModal from "@/components/organisms/AuthModal";
import { createClient } from "@/config/supabase/server";
import { getSafeRedirectPath } from "@/utils/getSafeRedirectPath";
import { redirect } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [countryMetadata, { next, authError }] = await Promise.all([
    fetchCountryMetadata(),
    searchParams,
  ]);

  const safeNext = getSafeRedirectPath(next);

  // Someone who is already signed in has no business on the sign-in screen --
  // landing here (e.g. from a stale "account" link tapped in the moment
  // between sign-in completing and the client auth cache catching up) would
  // otherwise just show the auth form again. Send them straight to `next`.
  // The one exception is a surfaced auth/link error, which still needs to be
  // shown.
  if (!authError) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect(safeNext ?? "/");
    }
  }

  return (
    <AuthModal
      callingCode={countryMetadata?.callingCode}
      next={safeNext}
      authError={Array.isArray(authError) ? authError[0] : authError}
    />
  );
}
