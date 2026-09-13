import PageHeader from "@/components/molecules/PageHeader";
import NotificationPreferencesPanel from "@/settings/organisms/NotificationPreferencesPanel";
import { getTranslations } from "next-intl/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const t = await getTranslations("settings");
  return (
    <div className="flex w-full max-w-3xl flex-col gap-8">
      <PageHeader title={t("nav.notifications")} showBackButton />
      <NotificationPreferencesPanel />
    </div>
  );
}
