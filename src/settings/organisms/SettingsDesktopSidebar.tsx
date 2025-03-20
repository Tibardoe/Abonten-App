import SettingsNavLinks from "../atoms/SettingsNavLinks";

export default function SettingsDesktopSideBar() {
  return (
    <div className="flex flex-col gap-5 w-full md:min-w-fit">
      <SettingsNavLinks
        href="/settings/overview"
        imgUrl="/assets/images/home.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text="Overview"
      />

      <SettingsNavLinks
        href="/settings/edit-profile"
        imgUrl="/assets/images/account.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text="Edit profile"
      />

      <SettingsNavLinks
        href="/settings/membership"
        imgUrl="/assets/images/membership.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text="Membership"
      />

      <SettingsNavLinks
        href="/settings/security"
        imgUrl="/assets/images/security.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text="Security"
      />

      <SettingsNavLinks
        href="/settings/switch-appearance"
        imgUrl="/assets/images/lightMode.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text="Switch appearance"
      />

      <SettingsNavLinks
        href="/settings/language"
        imgUrl="/assets/images/language.svg"
        arrowUrl="/assets/images/arrowRight.svg"
        text="Language"
      />
    </div>
  );
}
