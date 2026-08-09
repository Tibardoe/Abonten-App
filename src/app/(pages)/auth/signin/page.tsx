import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import AuthModal from "@/components/organisms/AuthModal";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const countryMetadata = await fetchCountryMetadata();

  return (
    <AuthModal buttonText="Signin" callingCode={countryMetadata?.callingCode} />
  );
}
