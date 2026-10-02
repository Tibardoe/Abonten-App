export const dynamic = "force-dynamic";

import getOrganizerEvents from "@/actions/getOrganizerEvents";
import { PageTitle } from "@/components/ui/typography";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import OrganizerManagedEventsList from "./OrganizerManagedEventsList";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("manage");
  return { title: t("yourEvents") };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components

function EmptyState() {
  const t = useTranslations("manage");
  return (
    <p className="text-muted-foreground text-sm">
      {t("youDontHaveAnyEventsYet")}
    </p>
  );
}

// "My Managed Events" -- the Events counterpart to manage/places/page.tsx.
// Reuses getOrganizerEvents.ts unchanged (already owner-scoped,
// cursor-paginated) -- this is the sole entry point into event management,
// per the Unified Event Management spec (Part 3/5).
export default async function page() {
  const t = await getTranslations("manage");

  const firstPage = await getOrganizerEvents();

  async function fetchPage(cursor: string | null) {
    "use server";
    return getOrganizerEvents({ cursor });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("yourEvents2")}</PageTitle>

      <OrganizerManagedEventsList
        queryKey={["organizer-events"]}
        initialPage={firstPage}
        fetchPage={fetchPage}
        emptyState={<EmptyState />}
      />
    </div>
  );
}
