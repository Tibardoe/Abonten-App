"use client";

import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { updateContentSettings } from "@/server/actions";
import type {
  ContentAudience,
  ContentSettings,
} from "@abonten/types/contentType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

type BoolKey = {
  [K in keyof ContentSettings]: ContentSettings[K] extends boolean ? K : never;
}[keyof ContentSettings];

type NumKey = {
  [K in keyof ContentSettings]: ContentSettings[K] extends number ? K : never;
}[keyof ContentSettings];

const SPOTLIGHT_TOGGLES: { key: BoolKey; label: string; hint?: string }[] = [
  {
    key: "spotlightEnabled",
    label: "Spotlight switched on",
    hint: "Shows the feed, the nav entry and profile tabs to the audience below. Off hides every entry point.",
  },
  {
    key: "spotlightPostingEnabled",
    label: "Posting",
    hint: "Organizers and place owners in the audience can create Spotlights.",
  },
  { key: "creatorPostingEnabled", label: "Creator tools" },
  { key: "spotlightCommentsEnabled", label: "Comments" },
  {
    key: "spotlightDownloadsEnabled",
    label: "Downloads",
    hint: "Only for posts whose author allowed it.",
  },
  { key: "nearbyEnabled", label: "Nearby tab" },
  { key: "trendingEnabled", label: "Trending tab" },
  { key: "happeningSoonEnabled", label: "Happening soon tab" },
  {
    key: "spotlightPromotionsEnabled",
    label: "Paid promotions",
    hint: "Lets people pay to promote a Spotlight. Every promotion still needs approval here before it runs.",
  },
  {
    key: "sponsoredDeliveryEnabled",
    label: "Show sponsored posts in feeds",
    hint: "Off stops every running promotion from being shown (nothing is charged while off). Organic Spotlight is not affected.",
  },
];

const STORY_TOGGLES: { key: BoolKey; label: string; hint?: string }[] = [
  {
    key: "storiesEnabled",
    label: "Stories switched on",
    hint: "Shows the Stories row in Messages and Story links to the audience below.",
  },
  { key: "storiesPostingEnabled", label: "Posting" },
  { key: "storiesCommentsEnabled", label: "Comments" },
  { key: "storiesReactionsEnabled", label: "Reactions" },
  { key: "storiesSharingEnabled", label: "Sharing" },
];

const NUMBERS: { group: string; key: NumKey; label: string; suffix: string }[] =
  [
    {
      group: "Stories",
      key: "storyTtlHours",
      label: "Story lifetime",
      suffix: "hours",
    },
    {
      group: "Stories",
      key: "maxStoryItems",
      label: "Items per Story",
      suffix: "items",
    },
    {
      group: "Limits",
      key: "spotlightPostsPerDay",
      label: "Spotlights per person",
      suffix: "per day",
    },
    {
      group: "Limits",
      key: "storiesPerDay",
      label: "Stories per person",
      suffix: "per day",
    },
    {
      group: "Limits",
      key: "commentsPerHour",
      label: "Comments per person",
      suffix: "per hour",
    },
    {
      group: "Limits",
      key: "followsPerHour",
      label: "Follows per person",
      suffix: "per hour",
    },
    {
      group: "Limits",
      key: "spotlightVideoMaxSeconds",
      label: "Spotlight video length",
      suffix: "seconds",
    },
    {
      group: "Limits",
      key: "storyVideoMaxSeconds",
      label: "Story video length",
      suffix: "seconds",
    },
    {
      group: "Feed",
      key: "feedPageSize",
      label: "Feed page size",
      suffix: "posts",
    },
    {
      group: "Feed",
      key: "trendingWindowHours",
      label: "Trending window",
      suffix: "hours",
    },
    {
      group: "Feed",
      key: "nearbyDefaultRadiusKm",
      label: "Nearby radius",
      suffix: "km",
    },
    {
      group: "Feed",
      key: "happeningSoonDays",
      label: "Happening soon window",
      suffix: "days",
    },
    {
      group: "Ranking",
      key: "rankWeightRecency",
      label: "Recency weight",
      suffix: "",
    },
    {
      group: "Ranking",
      key: "rankWeightEngagement",
      label: "Engagement weight",
      suffix: "",
    },
    {
      group: "Ranking",
      key: "rankWeightFollowing",
      label: "Following weight",
      suffix: "",
    },
    {
      group: "Ranking",
      key: "rankWeightProximity",
      label: "Proximity weight",
      suffix: "",
    },
    {
      group: "Ranking",
      key: "rankWeightUrgency",
      label: "Event urgency weight",
      suffix: "",
    },
    {
      group: "Ranking",
      key: "rankSeenPenalty",
      label: "Already-seen penalty",
      suffix: "0–1",
    },
    {
      group: "Sponsored",
      key: "sponsoredMaxShareBps",
      label: "Sponsored share of a page",
      suffix: "basis points",
    },
    {
      group: "Sponsored",
      key: "sponsoredMinGap",
      label: "Posts between sponsored slots",
      suffix: "posts",
    },
    {
      group: "Sponsored",
      key: "sponsoredDailyCapPerViewer",
      label: "Sponsored per viewer",
      suffix: "per day",
    },
    {
      group: "Telemetry",
      key: "meaningfulViewMs",
      label: "A view counts after",
      suffix: "ms",
    },
    {
      group: "Telemetry",
      key: "viewsPerViewerPerMinute",
      label: "View events accepted per viewer",
      suffix: "per minute",
    },
    {
      group: "Retention",
      key: "expiredStoryRetentionDays",
      label: "Keep ended Stories",
      suffix: "days",
    },
    {
      group: "Retention",
      key: "deletedPostRetentionDays",
      label: "Keep deleted posts",
      suffix: "days",
    },
    {
      group: "Retention",
      key: "rawViewRetentionDays",
      label: "Keep raw view events",
      suffix: "days",
    },
    {
      group: "Retention",
      key: "orphanMediaHours",
      label: "Delete unused uploads after",
      suffix: "hours",
    },
  ];

function AudienceSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: ContentAudience;
  disabled: boolean;
  onChange: (v: ContentAudience) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ContentAudience)}
      className={cn(input, "mt-1 w-56")}
    >
      <option value="staff">Staff only (active admins)</option>
      <option value="beta">Staff + beta users</option>
      <option value="all">Everyone</option>
    </select>
  );
}

export function ContentSettingsForm({
  settings,
  killSwitches,
  canConfigure,
  stepUpFresh,
}: {
  settings: ContentSettings;
  killSwitches: { spotlight: boolean; stories: boolean; promotions: boolean };
  canConfigure: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [s, setS] = useState(settings);
  const [beta, setBeta] = useState(settings.betaUserIds.join("\n"));
  const [numbers, setNumbers] = useState<Record<NumKey, string>>(
    Object.fromEntries(
      NUMBERS.map((n) => [n.key, String(settings[n.key])]),
    ) as Record<NumKey, string>,
  );
  const [reason, setReason] = useState("");
  const editable = canConfigure && stepUpFresh;
  const set = <K extends keyof ContentSettings>(
    key: K,
    value: ContentSettings[K],
  ) => setS((prev) => ({ ...prev, [key]: value }));

  const widening =
    (s.spotlightEnabled &&
      s.spotlightAudience === "all" &&
      !(settings.spotlightEnabled && settings.spotlightAudience === "all")) ||
    (s.storiesEnabled &&
      s.storiesAudience === "all" &&
      !(settings.storiesEnabled && settings.storiesAudience === "all"));
  const promotionsOn =
    s.spotlightPromotionsEnabled && !settings.spotlightPromotionsEnabled;

  const save = () =>
    start(async () => {
      setMsg(null);
      if (
        widening &&
        !window.confirm(
          "This opens Spotlight or Stories to everyone, including signed-out visitors. Continue?",
        )
      ) {
        return;
      }
      if (
        promotionsOn &&
        !window.confirm(
          "This lets people pay for promotions. Make sure someone is reviewing the promotion queue. Continue?",
        )
      ) {
        return;
      }
      const numericPatch: Partial<Record<NumKey, number>> = {};
      for (const n of NUMBERS) {
        const value = Number(numbers[n.key]);
        if (!Number.isFinite(value)) {
          setMsg({ ok: false, text: `${n.label} must be a number.` });
          return;
        }
        numericPatch[n.key] = value;
      }
      const res = await updateContentSettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        patch: {
          ...Object.fromEntries(
            [...SPOTLIGHT_TOGGLES, ...STORY_TOGGLES].map((t) => [
              t.key,
              s[t.key],
            ]),
          ),
          spotlightAudience: s.spotlightAudience,
          storiesAudience: s.storiesAudience,
          betaUserIds: beta
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean),
          ...numericPatch,
        },
      });
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Saved." : "Couldn't save."),
      });
      if (res.status === 200) {
        setReason("");
        router.refresh();
      }
    });

  const groups = [...new Set(NUMBERS.map((n) => n.group))];

  return (
    <div className="space-y-4">
      {killSwitches.spotlight ||
      killSwitches.stories ||
      killSwitches.promotions ? (
        <Card className="border-destructive/40 p-3 text-sm">
          A deploy-level kill switch is set (
          {[
            killSwitches.spotlight && "SPOTLIGHT_KILL_SWITCH",
            killSwitches.stories && "STORIES_KILL_SWITCH",
            killSwitches.promotions && "SPOTLIGHT_PROMOTIONS_KILL_SWITCH",
          ]
            .filter(Boolean)
            .join(", ")}
          ). It wins over these settings until it is removed from the web
          deployment.
        </Card>
      ) : null}
      {canConfigure && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing these settings needs a fresh identity check.
          <StepUpButton next="/spotlight/settings" />
        </Card>
      ) : null}
      {!canConfigure ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Configure
          Spotlight” permission.
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Spotlight</p>
        <div className="text-sm">
          <label htmlFor="spotlight-audience" className="block font-medium">
            Who sees Spotlight
          </label>
          <AudienceSelect
            id="spotlight-audience"
            value={s.spotlightAudience}
            disabled={!editable}
            onChange={(v) => set("spotlightAudience", v)}
          />
        </div>
        {SPOTLIGHT_TOGGLES.map((t) => (
          <Toggle
            key={t.key}
            label={t.label}
            hint={t.hint}
            checked={s[t.key]}
            disabled={!editable}
            onChange={(v) => set(t.key, v)}
          />
        ))}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Stories</p>
        <div className="text-sm">
          <label htmlFor="stories-audience" className="block font-medium">
            Who sees Stories
          </label>
          <AudienceSelect
            id="stories-audience"
            value={s.storiesAudience}
            disabled={!editable}
            onChange={(v) => set("storiesAudience", v)}
          />
        </div>
        {STORY_TOGGLES.map((t) => (
          <Toggle
            key={t.key}
            label={t.label}
            hint={t.hint}
            checked={s[t.key]}
            disabled={!editable}
            onChange={(v) => set(t.key, v)}
          />
        ))}
      </Card>

      <Card className="space-y-2 p-4">
        <label htmlFor="content-beta" className="text-sm font-semibold">
          Beta users
        </label>
        <p className="text-xs text-muted-foreground">
          User ids, one per line. Used when an audience is “Staff + beta users”.
        </p>
        <textarea
          id="content-beta"
          value={beta}
          disabled={!editable}
          onChange={(e) => setBeta(e.target.value)}
          rows={4}
          className={cn(input, "font-mono text-xs")}
        />
      </Card>

      {groups.map((group) => (
        <Card key={group} className="space-y-3 p-4">
          <p className="text-sm font-semibold">{group}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {NUMBERS.filter((n) => n.group === group).map((n) => (
              <div key={n.key} className="text-sm">
                <label
                  htmlFor={`content-${n.key}`}
                  className="block font-medium"
                >
                  {n.label}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id={`content-${n.key}`}
                    inputMode="decimal"
                    value={numbers[n.key]}
                    disabled={!editable}
                    onChange={(e) =>
                      setNumbers((prev) => ({
                        ...prev,
                        [n.key]: e.target.value,
                      }))
                    }
                    className={cn(input, "w-28")}
                  />
                  {n.suffix ? (
                    <span className="text-xs text-muted-foreground">
                      {n.suffix}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card className="space-y-2 p-4">
        <label htmlFor="content-reason" className="text-sm font-semibold">
          Reason for this change
        </label>
        <input
          id="content-reason"
          value={reason}
          disabled={!editable}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Recorded in the audit log"
          className={input}
        />
        <div className="flex items-center gap-3">
          <Button
            disabled={!editable || pending || reason.trim().length < 5}
            onClick={save}
          >
            {pending ? "Saving…" : "Save settings"}
          </Button>
          {msg ? (
            <span
              className={cn(
                "text-sm",
                msg.ok ? "text-success" : "text-destructive",
              )}
            >
              {msg.text}
            </span>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block">{label}</span>
        {hint ? (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
