import { Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadSocialQueue } from "@/lib/data";
import { formatOpsDate } from "@/lib/format";
import {
  type SocialChannel,
  type SocialPostStatus,
  isSocialChannel,
  isSocialPostStatus,
} from "@abonten/core/social/socialChannels";
import Link from "next/link";
import { SocialQueueSettingsForm } from "./SocialQueueSettingsForm";
import { SocialSubjectCard } from "./SocialSubjectCard";
import { SOCIAL_CHANNEL_LABEL } from "./channelLabels";

// Admin › Social (docs/admin/social.md): what to post today on Abonten's own
// Instagram, X and WhatsApp Channel. The jobs queue every new public event
// and place, and a roundup on Mondays and Fridays; each card has the
// pictures, the caption and the tagged link for one channel. Instagram is
// posted by hand on the phone; nothing here posts anything. The console is
// English-only.

const TABS: { status: SocialPostStatus; label: string }[] = [
  { status: "pending", label: "To post" },
  { status: "posted", label: "Posted" },
  { status: "skipped", label: "Skipped" },
];

function href(status: SocialPostStatus, channel: SocialChannel | null) {
  const q = new URLSearchParams();
  if (status !== "pending") q.set("status", status);
  if (channel) q.set("channel", channel);
  const s = q.toString();
  return s ? `/social?${s}` : "/social";
}

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; channel?: string }>;
}) {
  await requirePermissionPage("social.view");
  const params = await searchParams;
  const status: SocialPostStatus = isSocialPostStatus(params.status)
    ? params.status
    : "pending";
  const channel = isSocialChannel(params.channel) ? params.channel : null;
  const { ctx, queue, settings } = await loadSocialQueue({ status, channel });
  const canManage = ctx.permissions.includes("social.manage");
  const view = queue.status === 200 ? queue.data : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Social"
        description="Posts for Abonten's own Instagram, X and WhatsApp Channel: every new public event and place, and a roundup on Mondays and Fridays. Post by hand, then mark it posted. Nothing here posts for you."
      />

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={href(tab.status, channel)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              tab.status === status
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border hover:bg-muted",
            )}
          >
            {tab.label}
            {view ? ` (${view.counts[tab.status]})` : ""}
          </Link>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <Link
          href={href(status, null)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            channel === null
              ? "border-primary text-primary"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          All channels
        </Link>
        {(Object.keys(SOCIAL_CHANNEL_LABEL) as SocialChannel[]).map((c) => (
          <Link
            key={c}
            href={href(status, c)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              channel === c
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {SOCIAL_CHANNEL_LABEL[c]}
          </Link>
        ))}
      </div>

      {settings.status === 200 && settings.data && !settings.data.enabled ? (
        <Card className="border-warning/40 p-3 text-sm">
          The queue is switched off: no new listings or roundups are being
          queued. What is already here can still be posted.
        </Card>
      ) : null}

      {!view ? (
        <EmptyState>{queue.message ?? "Couldn't load the queue."}</EmptyState>
      ) : view.days.length === 0 ? (
        <EmptyState>
          {status === "pending"
            ? "Nothing to post. New events and places appear here within about 20 minutes of being published."
            : status === "posted"
              ? "Nothing posted in the last 30 days."
              : "Nothing skipped in the last 30 days."}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {view.days.map((day) => (
            <section key={day.day} className="space-y-3">
              <h2 className="text-sm font-semibold">
                {day.isToday ? "Today, " : ""}
                {formatOpsDate(`${day.day}T00:00:00Z`)}
                <span className="ml-2 font-normal text-muted-foreground">
                  {day.subjects.length}{" "}
                  {day.subjects.length === 1 ? "listing" : "listings"}
                </span>
              </h2>
              {day.subjects.map((subject) => (
                <SocialSubjectCard
                  key={`${day.day}|${subject.key}`}
                  subject={subject}
                  canManage={canManage}
                />
              ))}
            </section>
          ))}
          {view.truncated ? (
            <p className="text-sm text-muted-foreground">
              Showing the first 300 posts. Filter by channel to see the rest.
            </p>
          ) : null}
        </div>
      )}

      {settings.status === 200 && settings.data ? (
        <SocialQueueSettingsForm
          settings={settings.data}
          canManage={canManage}
        />
      ) : (
        <EmptyState>
          {settings.message ?? "Couldn't load the queue settings."}
        </EmptyState>
      )}
    </div>
  );
}
