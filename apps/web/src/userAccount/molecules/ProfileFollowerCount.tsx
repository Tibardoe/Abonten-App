"use client";

import { useContentProgram } from "@/spotlight/hooks/useContentProgram";
import { useFollow } from "@/spotlight/hooks/useFollow";
import { formatCount } from "@abonten/core/i18n/format";
import { useLocale, useTranslations } from "next-intl";

// "N followers" in the profile's stats row. Reads the same follow status the
// Follow button does (one request, shared through React Query), so the
// number moves the moment someone follows. Follow only exists while
// Spotlight or Stories is on for the visitor, so the count goes with it.
export default function ProfileFollowerCount({ userId }: { userId: string }) {
  const locale = useLocale();
  const t = useTranslations("account");

  const { program } = useContentProgram();
  const visible = program.spotlight || program.stories;
  const { status } = useFollow("organizer", userId, visible);

  if (!visible || !status.data) return null;
  const count = status.data.followerCount;

  return (
    <div>
      <dt className="sr-only">{t("followers")}</dt>
      <dd>
        <span className="font-semibold tabular-nums">
          {formatCount(count, locale)}
        </span>{" "}
        {count === 1 ? t("follower") : t("followers2")}
      </dd>
    </div>
  );
}
