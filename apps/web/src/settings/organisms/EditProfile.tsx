import { useTranslations } from "next-intl";
export default function EditProfile() {
  const t = useTranslations("settings");

  return <div>{t("editProfile2")}</div>;
}
