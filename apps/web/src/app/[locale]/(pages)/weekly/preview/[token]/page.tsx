import { getWeeklyPreview } from "@/utils/weeklyPublic";
import WeeklyEditionView from "@/weekly/organisms/WeeklyEditionView";
import { WEEKLY_EDITION_STATUS_LABEL } from "@abonten/core/weekly/copy";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// A draft, scheduled or published edition exactly as the public would see it,
// opened from Admin › Abonten Weekly. The signed link is the only credential
// (30 minutes, one edition); the page is never cached or indexed.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("weekly");
  return {
    title: t("previewAbontenWeekly"),
    robots: { index: false, follow: false },
  };
}

// Staff-only link, stated in UTC: one clock for every market's editors.
const formatUtc = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default async function WeeklyPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const t = await getTranslations("weekly");

  const { token } = await params;
  const result = await getWeeklyPreview(decodeURIComponent(token));

  if (result.status !== 200 || !result.data) {
    return (
      <div className="mx-auto max-w-xl space-y-3 rounded-2xl border border-border p-6 text-center">
        <h1 className="text-xl font-semibold">{t("previewUnavailable")}</h1>
        <p className="text-muted-foreground">
          {result.message ?? t("thisPreviewLinkHasExpired")}{" "}
          {t("openTheEditionInTheAdmin")}
        </p>
        <Link href="/explore" className="text-primary underline">
          {t("goToExplore")}
        </Link>
      </div>
    );
  }

  const { edition, status, expiresAt } = result.data;
  return (
    <div className="space-y-4">
      <aside
        aria-label={t("previewNotice")}
        className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm"
      >
        <span>
          <strong>{t("preview")}</strong>{" "}
          {t("notVisibleToThePublicUnless", {
            item: WEEKLY_EDITION_STATUS_LABEL[status],
          })}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("linkWorksUntilUtc", { formatUtc: formatUtc(expiresAt) })}
        </span>
      </aside>
      <WeeklyEditionView doc={edition} preview />
    </div>
  );
}
