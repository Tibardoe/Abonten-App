import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import getSecurityDetails from "@/actions/getSecurityDetails";
import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import SecurityInputFields from "@/components/organisms/SecurityInputFields";
import { getTranslations } from "next-intl/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const [t, security, countryMetadata] = await Promise.all([
    getTranslations("settings"),
    getSecurityDetails(),
    fetchCountryMetadata(),
  ]);

  if (security.status !== 200) {
    return <p className="text-destructive">{security.message}</p>;
  }

  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title={t("nav.security")} />
      <SecurityInputFields
        initialPhone={security.details.phone}
        initialPhoneVerified={security.details.phoneVerified}
        initialEmail={security.details.email}
        initialEmailVerified={security.details.emailVerified}
        initialCallingCode={countryMetadata?.callingCode}
      />
    </div>
  );
}
