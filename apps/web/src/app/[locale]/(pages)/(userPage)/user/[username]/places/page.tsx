import getOrganizerPlaces from "@/actions/getOrganizerPlaces";
import { getUserProfileDetails } from "@/actions/getUserProfileDetails";
import CreatePlaceButton from "@/places/atoms/CreatePlaceButton";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import UserPlacesList from "./UserPlacesList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

function OwnEmptyState() {
  const t = useTranslations("account");
  return (
    <div className="flex flex-col items-center">
      <h1 className="font-bold text-2xl">{t("noPlacesYet")}</h1>

      <p className="text-sm text-muted-foreground">
        {t("listYourBusinessOrVenueFor")}
      </p>

      <CreatePlaceButton />
    </div>
  );
}

function OtherEmptyState() {
  const t = useTranslations("account");
  return (
    <p className="text-center mt-5 text-muted-foreground text-sm">
      {t("noPlacesYetDot")}
    </p>
  );
}

// getOrganizerPlaces now accepts an optional username (mirrors
// getUserPosts) so this page can show any profile's public places, not
// just the signed-in viewer's own -- see getOrganizerPlaces.ts.
export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const t = await getTranslations("account");

  const { username } = await params;

  const profile = await getUserProfileDetails(username);
  const isCurrentUser =
    profile.status === 200 && profile.ownUsername === username;

  const firstPage = await getOrganizerPlaces({ username });

  if (firstPage.status !== 200) {
    return (
      <div className="text-center mt-5 text-destructive">
        {t("failedToLoadPlaces", { message: firstPage.message ?? "" })}
      </div>
    );
  }

  async function fetchPage(cursor: string | null) {
    "use server";
    return getOrganizerPlaces({ username, cursor });
  }

  return (
    <UserPlacesList
      queryKey={["places-owned", username]}
      initialPage={firstPage}
      fetchPage={fetchPage}
      emptyState={isCurrentUser ? <OwnEmptyState /> : <OtherEmptyState />}
    />
  );
}
