import { getWeeklyPreview } from "@/utils/weeklyPublic";
import WeeklyEditionView from "@/weekly/organisms/WeeklyEditionView";
import { WEEKLY_EDITION_STATUS_LABEL } from "@abonten/core/weekly/copy";
import type { Metadata } from "next";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// A draft, scheduled or published edition exactly as the public would see it,
// opened from Admin › Abonten Weekly. The signed link is the only credential
// (30 minutes, one edition); the page is never cached or indexed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview · Abonten Weekly",
  robots: { index: false, follow: false },
};

const formatAccra = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default async function WeeklyPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getWeeklyPreview(decodeURIComponent(token));

  if (result.status !== 200 || !result.data) {
    return (
      <div className="mx-auto max-w-xl space-y-3 rounded-2xl border border-border p-6 text-center">
        <h1 className="text-xl font-semibold">Preview unavailable</h1>
        <p className="text-muted-foreground">
          {result.message ?? "This preview link has expired."} Open the edition
          in the admin console and choose Preview again.
        </p>
        <Link href="/explore" className="text-primary underline">
          Go to Explore
        </Link>
      </div>
    );
  }

  const { edition, status, expiresAt } = result.data;
  return (
    <div className="space-y-4">
      <aside
        aria-label="Preview notice"
        className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm"
      >
        <span>
          <strong>Preview</strong> — {WEEKLY_EDITION_STATUS_LABEL[status]}. Not
          visible to the public unless published. Listings that cannot be shown
          are already left out.
        </span>
        <span className="text-xs text-muted-foreground">
          Link works until {formatAccra(expiresAt)} (Accra)
        </span>
      </aside>
      <WeeklyEditionView doc={edition} preview />
    </div>
  );
}
