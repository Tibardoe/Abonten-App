import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import AuthModal from "@/components/organisms/AuthModal";

export default async function page() {
  const countryMetadata = await fetchCountryMetadata();

  return (
    <AuthModal buttonText="Signin" callingCode={countryMetadata?.callingCode} />
  );
}
