import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import AuthModal from "@/components/organisms/AuthModal";
import { getSafeRedirectPath } from "@/utils/getSafeRedirectPath";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const countryMetadata = await fetchCountryMetadata();
  const { next } = await searchParams;

  return (
    <AuthModal
      buttonText="Signin"
      callingCode={countryMetadata?.callingCode}
      next={getSafeRedirectPath(next)}
    />
  );
}
