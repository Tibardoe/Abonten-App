import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import SwitchAppearance from "@/settings/organisms/SwitchAppearance";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function page() {
  return (
    <div className="w-full flex flex-col gap-14">
      <MobileSettingsHeaderNav title="Switch Appearance" />
      <SwitchAppearance />
    </div>
  );
}
