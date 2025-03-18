import { useSettingsTab } from "@/context/settingsContext";
import EditProfile from "./EditProfile";
import Language from "./Language";
import Membership from "./Membership";
import Overview from "./Overview";
import Security from "./Security";
import SwitchAppearance from "./SwitchAppearance";

export default function SettingsContentArea() {
  const { settingsActiveTab } = useSettingsTab();

  return (
    <div className="hidden lg:flex flex-1">
      {settingsActiveTab === "overview" && <Overview />}
      {settingsActiveTab === "edit profile" && <EditProfile />}
      {settingsActiveTab === "membership" && <Membership />}
      {settingsActiveTab === "security" && <Security />}
      {settingsActiveTab === "switch appearance" && <SwitchAppearance />}
      {settingsActiveTab === "language" && <Language />}
    </div>
  );
}
