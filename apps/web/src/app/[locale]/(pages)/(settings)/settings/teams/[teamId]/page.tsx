import PageHeader from "@/components/molecules/PageHeader";
import { createClient } from "@/config/supabase/server";
import TeamDetailView from "@/teams/organisms/TeamDetailView";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("teams");
  return { title: t("title") };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function page({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  if (!UUID.test(teamId)) notFound();
  const [t, supabase] = await Promise.all([
    getTranslations("teams"),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <div className="flex w-full flex-col gap-8">
      <PageHeader title={t("title")} showBackButton />
      <TeamDetailView teamId={teamId} viewerId={user?.id ?? ""} />
    </div>
  );
}
