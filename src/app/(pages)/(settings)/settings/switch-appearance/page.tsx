import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import SwitchAppearance from "@/settings/organisms/SwitchAppearance";

export default function page() {
  return (
    <div className="w-full flex flex-col gap-14">
      <MobileSettingsHeaderNav title="Switch Appearance" />
      <SwitchAppearance />
    </div>
  );
}
