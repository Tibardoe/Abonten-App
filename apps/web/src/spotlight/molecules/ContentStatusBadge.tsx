import { cn } from "@/components/lib/utils";
import { CAMPAIGN_STATUS_LABEL } from "@abonten/core/content/copy";
import type {
  ContentCampaignStatus,
  ContentOwnPost,
} from "@abonten/types/contentType";

export function postStatusLabel(post: ContentOwnPost): {
  label: string;
  tone: "live" | "muted" | "warn" | "bad";
} {
  if (post.moderationState === "removed")
    return { label: "Removed", tone: "bad" };
  if (post.moderationState === "hidden")
    return { label: "Hidden", tone: "bad" };
  if (post.status === "draft") return { label: "Draft", tone: "muted" };
  if (post.status === "archived") return { label: "Archived", tone: "muted" };
  if (
    post.kind === "story" &&
    post.expiresAt &&
    Date.parse(post.expiresAt) <= Date.now()
  ) {
    return { label: "Ended", tone: "muted" };
  }
  if (post.moderationState === "restricted") {
    return { label: "Limited", tone: "warn" };
  }
  return { label: "Live", tone: "live" };
}

const TONE: Record<"live" | "muted" | "warn" | "bad", string> = {
  live: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  muted: "bg-muted text-muted-foreground",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  bad: "bg-destructive/15 text-destructive",
};

export function StatusPill({
  label,
  tone,
  className,
}: {
  label: string;
  tone: keyof typeof TONE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        TONE[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function campaignTone(status: ContentCampaignStatus): keyof typeof TONE {
  if (status === "active" || status === "scheduled") return "live";
  if (
    status === "pending_review" ||
    status === "pending_payment" ||
    status === "paused"
  ) {
    return "warn";
  }
  if (status === "rejected") return "bad";
  return "muted";
}

export function CampaignStatusPill({
  status,
}: {
  status: ContentCampaignStatus;
}) {
  return (
    <StatusPill
      label={CAMPAIGN_STATUS_LABEL[status]}
      tone={campaignTone(status)}
    />
  );
}
