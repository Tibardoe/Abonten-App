import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import AuthModal from "@/components/organisms/AuthModal";
import { getSafeRedirectPath } from "@/utils/getSafeRedirectPath";
import { getTranslations } from "next-intl/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [countryMetadata, t, { next }] = await Promise.all([
    fetchCountryMetadata(),
    getTranslations("auth"),
    searchParams,
  ]);

  return (
    <AuthModal
      buttonText={t("signInButton")}
      callingCode={countryMetadata?.callingCode}
      next={getSafeRedirectPath(next)}
    />
  );
}
