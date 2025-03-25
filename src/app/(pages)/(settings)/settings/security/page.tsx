import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import SecurityInputFields from "@/components/organisms/SecurityInputFields";

export default function page() {
  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title="Security" />
      <SecurityInputFields />
    </div>
  );
}
