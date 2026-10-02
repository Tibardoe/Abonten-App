import { getUserPosts } from "@/actions/getUserPosts";
import PostButton from "@/components/atoms/PostButton";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import UserPostsList from "./UserPostsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

function EmptyState() {
  const t = useTranslations("account");
  return (
    <div className="flex flex-col items-center">
      <h1 className="font-bold text-2xl">{t("noEventsYet")}</h1>

      <p className="text-sm text-muted-foreground">
        {t("postEventsForOthersToAttend")}
      </p>

      <PostButton />
    </div>
  );
}

export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const t = await getTranslations("account");

  const { username } = await params;

  const firstPage = await getUserPosts(username);

  if (firstPage.status !== 200) {
    return (
      <div className="text-center mt-5 text-destructive">
        {t("failedToLoadEvents", { message: firstPage.message ?? "" })}
      </div>
    );
  }

  async function fetchPage(cursor: string | null) {
    "use server";
    return getUserPosts(username, { cursor });
  }

  return (
    <UserPostsList
      queryKey={["user-posts", username]}
      initialPage={firstPage}
      fetchPage={fetchPage}
      emptyState={<EmptyState />}
    />
  );
}
