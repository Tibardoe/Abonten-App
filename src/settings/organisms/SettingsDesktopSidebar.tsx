import { getTranslations } from "next-intl/server";
import SettingsNavLinks from "../atoms/SettingsNavLinks";

export default async function SettingsDesktopSideBar() {
  const t = await getTranslations("settings");

  return (
    <div className="flex flex-col gap-5 w-full md:min-w-fit">
      <SettingsNavLinks
        href="/settings/overview"
        imgUrl="/assets/images/home.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text={t("nav.overview")}
      />

      <SettingsNavLinks
        href="/settings/edit-profile"
        imgUrl="/assets/images/account.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text={t("nav.editProfile")}
      />

      <SettingsNavLinks
        href="/settings/membership"
        imgUrl="/assets/images/membership.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text={t("nav.membership")}
      />

      <SettingsNavLinks
        href="/settings/security"
        imgUrl="/assets/images/security.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text={t("nav.security")}
      />

      <SettingsNavLinks
        href="/settings/switch-appearance"
        imgUrl="/assets/images/lightMode.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text={t("nav.switchAppearance")}
      />

      <SettingsNavLinks
        href="/settings/language"
        imgUrl="/assets/images/language.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text={t("nav.language")}
      />
    </div>
  );
}
