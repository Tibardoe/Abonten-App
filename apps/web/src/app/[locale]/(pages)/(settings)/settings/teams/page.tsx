import PageHeader from "@/components/molecules/PageHeader";
import TeamsOverview from "@/teams/organisms/TeamsOverview";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("teams");
  return { title: t("title") };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const t = await getTranslations("teams");
  return (
    <div className="flex w-full flex-col gap-8">
      <PageHeader title={t("title")} showBackButton />
      <TeamsOverview />
    </div>
  );
}
