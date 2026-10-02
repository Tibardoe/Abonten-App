import { useTranslations } from "next-intl";
export default function Security() {
  const t = useTranslations("settings");

  return <div>{t("securityTitle")}</div>;
}
