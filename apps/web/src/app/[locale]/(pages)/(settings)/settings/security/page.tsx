import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import getSecurityDetails from "@/actions/getSecurityDetails";
import PageHeader from "@/components/molecules/PageHeader";
import SecurityInputFields from "@/components/organisms/SecurityInputFields";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("securityTitle") };
}

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
      <PageHeader title={t("nav.security")} showBackButton />
      <SecurityInputFields
        initialPhone={security.details.phone}
        initialPhoneVerified={security.details.phoneVerified}
        initialEmail={security.details.email}
        initialEmailVerified={security.details.emailVerified}
        hasGoogleIdentity={security.details.hasGoogleIdentity}
        initialCallingCode={countryMetadata?.callingCode}
      />
    </div>
  );
}
