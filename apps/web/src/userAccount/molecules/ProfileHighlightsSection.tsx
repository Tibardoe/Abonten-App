"use client";

import getUserHighlight from "@/actions/getUserHighlights";
import UserHighlights from "@/components/molecules/UserHighlights";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Higlight from "./Highlight";

// The profile's Highlights row. The owner always sees it (it holds the "add
// a highlight" button); a visitor sees it only when there is something in
// it, instead of a heading over an empty row. Shares UserHighlights' query
// key, so this costs no extra request.
export default function ProfileHighlightsSection({
  username,
  avatarUrl,
  isOwner,
}: {
  username: string;
  avatarUrl: string;
  isOwner: boolean;
}) {
  const t = useTranslations("account");

  const { data, isLoading } = useQuery({
    queryKey: ["highlights", username],
    queryFn: async () => (await getUserHighlight(username)).data,
  });
  const hasHighlights = Array.isArray(data) && data.length > 0;

  if (!isOwner && !isLoading && !hasHighlights) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold">{t("highlights")}</h2>

      <div className="flex items-center gap-2 overflow-hidden">
        {isOwner && <Higlight username={username} />}

        <UserHighlights
          avatarUrl={avatarUrl}
          username={username}
          isOwner={isOwner}
        />
      </div>
    </div>
  );
}
