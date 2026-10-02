import PageHeader from "@/components/molecules/PageHeader";
import ForYouList from "@/discovery/organisms/ForYouList";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discovery");
  return {
    title: t("forYou"),
    robots: { index: false },
  };
}

export default function page() {
  const t = useTranslations("discovery");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={t("forYou")} showBackButton />
      <ForYouList />
    </div>
  );
}
