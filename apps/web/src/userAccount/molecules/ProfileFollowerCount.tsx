"use client";

import { useContentProgram } from "@/spotlight/hooks/useContentProgram";
import { useFollow } from "@/spotlight/hooks/useFollow";
import { useTranslations } from "next-intl";

// "N followers" in the profile's stats row. Reads the same follow status the
// Follow button does (one request, shared through React Query), so the
// number moves the moment someone follows. Follow only exists while
// Spotlight or Stories is on for the visitor, so the count goes with it.
export default function ProfileFollowerCount({ userId }: { userId: string }) {
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
        {/* One message for the number and its noun: "1 abonné",
            "2 abonnés", and whatever order a language wants. */}
        {t.rich("followersCount", {
          count,
          b: (chunks) => (
            <span className="font-semibold tabular-nums">{chunks}</span>
          ),
        })}
      </dd>
    </div>
  );
}
