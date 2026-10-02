export const dynamic = "force-dynamic";

import getOrganizerPlaces from "@/actions/getOrganizerPlaces";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import OrganizerPlacesList from "./OrganizerPlacesList";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("manage");
  return { title: t("yourPlaces") };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

function EmptyState() {
  const t = useTranslations("manage");
  return (
    <p className="text-muted-foreground text-sm">
      {t("youDontOwnAnyPlacesYet")}
    </p>
  );
}

// List of the signed-in user's owned places -- mirrors manage/events/page.tsx
// (getOrganizerPlaces is the Places counterpart to getOrganizerEvents, same
// InfiniteList shape).
export default async function page() {
  const t = await getTranslations("manage");

  const firstPage = await getOrganizerPlaces();

  async function fetchPage(cursor: string | null) {
    "use server";
    return getOrganizerPlaces({ cursor });
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-bold md:text-xl">{t("yourPlaces2")}</h1>

      <OrganizerPlacesList
        queryKey={["organizer-places"]}
        initialPage={firstPage}
        fetchPage={fetchPage}
        emptyState={<EmptyState />}
      />
    </div>
  );
}
