import { useSettingsTab } from "@/context/settingsContext";
import SettingsNavLinks from "../atoms/SettingsNavLinks";
import SettingsContentArea from "../organisms/SettingsContentArea";

export default function Settings() {
  const { settingsActiveTab } = useSettingsTab();

  return (
    <div className="w-[90%] md:w-[80%] mx-auto pt-24 md:pt-32 min-h-dvh">
      <div className="gap-20 lg:grid grid-cols-[auto_1fr]">
        <div />

        <h1 className="font-bold text-3xl lg:text-4xl hidden lg:block">
          {settingsActiveTab
            ?.split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")}
        </h1>

        <div className="flex flex-col gap-5">
          <SettingsNavLinks
            imgUrl="/assets/images/home.svg"
            arrowUrl="/assets/images/arrowRight.svg"
            text="Overview"
          />

          <SettingsNavLinks
            imgUrl="/assets/images/account.svg"
            arrowUrl="/assets/images/arrowRight.svg"
            text="Edit profile"
          />

          <SettingsNavLinks
            imgUrl="/assets/images/membership.svg"
            arrowUrl="/assets/images/arrowRight.svg"
            text="Membership"
          />

          <SettingsNavLinks
            imgUrl="/assets/images/security.svg"
            arrowUrl="/assets/images/arrowRight.svg"
            text="Security"
          />

          <SettingsNavLinks
            imgUrl="/assets/images/lightMode.svg"
            arrowUrl="/assets/images/arrowRight.svg"
            text="Switch appearance"
          />

          <SettingsNavLinks
            imgUrl="/assets/images/language.svg"
            arrowUrl="/assets/images/arrowRight.svg"
            text="Language"
          />
        </div>

        {/* desktop settigs side display */}
        <SettingsContentArea />
      </div>
    </div>
  );
}
