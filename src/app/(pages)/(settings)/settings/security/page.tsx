import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import SecurityInputFields from "@/components/organisms/SecurityInputFields";
import { getTranslations } from "next-intl/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const t = await getTranslations("settings");

  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title={t("nav.security")} />
      <SecurityInputFields />
    </div>
  );
}
