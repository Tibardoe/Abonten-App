"use client";

import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { updateDiscoverySettings } from "@/server/actions";
import type {
  DiscoveryAudience,
  DiscoverySettings,
} from "@abonten/types/discoveryType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

type NumberKey =
  | "searchLogRetentionDays"
  | "dailyPushCap"
  | "weeklyPushCap"
  | "organizerCooldownHours"
  | "similarDefaultRadiusKm"
  | "candidateTtlDays"
  | "ignorePauseAfter"
  | "ignorePauseDays"
  | "digestHourLocal"
  | "promptCooldownDays"
  | "promptDismissDays"
  | "promptMaxShows"
  | "recommendationRetentionDays";

const NUMBERS: {
  key: NumberKey;
  label: string;
  hint: string;
  suffix: string;
}[] = [
  {
    key: "dailyPushCap",
    label: "Pushes per day",
    hint: "Recommendation digests per person per day. 0 stops them.",
    suffix: "per day",
  },
  {
    key: "weeklyPushCap",
    label: "Pushes per week",
    hint: "Across a rolling seven days.",
    suffix: "per week",
  },
  {
    key: "digestHourLocal",
    label: "Digest hour",
    hint: "Accra time, 8 to 20. Pushes never go out at night.",
    suffix: ":00",
  },
  {
    key: "organizerCooldownHours",
    label: "Organizer cooldown",
    hint: "Hold a second event from the same organizer unless it starts within 48 hours.",
    suffix: "hours",
  },
  {
    key: "similarDefaultRadiusKm",
    label: "Similar events radius",
    hint: "How far from the original event counts as nearby.",
    suffix: "km",
  },
  {
    key: "candidateTtlDays",
    label: "Pick freshness",
    hint: "A pick not sent within this many days is dropped.",
    suffix: "days",
  },
  {
    key: "ignorePauseAfter",
    label: "Pause after unopened digests",
    hint: "This many delivered digests in a row nobody opened pauses the person.",
    suffix: "digests",
  },
  {
    key: "ignorePauseDays",
    label: "Automatic pause length",
    hint: "",
    suffix: "days",
  },
  {
    key: "promptCooldownDays",
    label: "Prompt cooldown",
    hint: "At most one opt-in prompt per person in this many days.",
    suffix: "days",
  },
  {
    key: "promptDismissDays",
    label: "After “Not now”",
    hint: "Don't ask about the same thing again for this long.",
    suffix: "days",
  },
  {
    key: "promptMaxShows",
    label: "Prompt shows, ever",
    hint: "Per topic, organizer or place.",
    suffix: "times",
  },
  {
    key: "searchLogRetentionDays",
    label: "Search log retention",
    hint: "Search analytics carry no user identifiers.",
    suffix: "days",
  },
  {
    key: "recommendationRetentionDays",
    label: "Recommendation retention",
    hint: "",
    suffix: "days",
  },
];

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

function AudienceSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: DiscoveryAudience;
  disabled: boolean;
  onChange: (v: DiscoveryAudience) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as DiscoveryAudience)}
      className={cn(input, "mt-1 w-56")}
    >
      <option value="staff">Staff only (active admins)</option>
      <option value="beta">Staff + beta users</option>
      <option value="all">Everyone</option>
    </select>
  );
}

// Same text on the server render and in the browser (a locale-dependent
// toLocaleString() broke hydration), in the timezone operations works in.
function formatAccraTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function SettingsForm({
  settings,
  killSwitches,
  canConfigure,
  stepUpFresh,
}: {
  settings: DiscoverySettings;
  killSwitches: { search: boolean; recommendations: boolean };
  canConfigure: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [s, setS] = useState(settings);
  const [beta, setBeta] = useState(settings.betaUserIds.join("\n"));
  const [numbers, setNumbers] = useState<Record<NumberKey, string>>(
    Object.fromEntries(
      NUMBERS.map((n) => [n.key, String(settings[n.key])]),
    ) as Record<NumberKey, string>,
  );
  const [resetWatermark, setResetWatermark] = useState(false);
  const [reason, setReason] = useState("");
  const editable = canConfigure && stepUpFresh;
  const set = <K extends keyof DiscoverySettings>(
    key: K,
    value: DiscoverySettings[K],
  ) => setS((prev) => ({ ...prev, [key]: value }));

  const goingLive =
    s.recommendationsEnabled &&
    !s.recommendationsShadowMode &&
    settings.recommendationsShadowMode;

  const save = () =>
    start(async () => {
      setMsg(null);
      if (
        goingLive &&
        !window.confirm(
          "This turns shadow mode off: real pushes will be sent to the chosen audience. Continue?",
        )
      ) {
        return;
      }
      const res = await updateDiscoverySettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        resetWatermark: resetWatermark || undefined,
        patch: {
          searchV2Enabled: s.searchV2Enabled,
          searchAudience: s.searchAudience,
          organizerSearchEnabled: s.organizerSearchEnabled,
          placeSearchEnabled: s.placeSearchEnabled,
          searchLoggingEnabled: s.searchLoggingEnabled,
          recommendationsEnabled: s.recommendationsEnabled,
          recommendationsShadowMode: s.recommendationsShadowMode,
          recommendationsAudience: s.recommendationsAudience,
          promptsEnabled: s.promptsEnabled,
          betaUserIds: beta
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean),
          ...Object.fromEntries(
            NUMBERS.map((n) => [n.key, Number(numbers[n.key])]),
          ),
        },
      });
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Saved." : "Couldn't save."),
      });
      if (res.status === 200) {
        setReason("");
        setResetWatermark(false);
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      {killSwitches.search || killSwitches.recommendations ? (
        <Card className="border-destructive/40 p-3 text-sm">
          A deploy-level kill switch is set (
          {[
            killSwitches.search && "SEARCH_V2_KILL_SWITCH",
            killSwitches.recommendations && "RECOMMENDATIONS_KILL_SWITCH",
          ]
            .filter(Boolean)
            .join(", ")}
          ). It wins over these settings until it is removed from the web
          deployment.
        </Card>
      ) : null}
      {canConfigure && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing Discovery settings needs a fresh identity check.
          <StepUpButton next="/discovery/settings" />
        </Card>
      ) : null}
      {!canConfigure ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Configure
          discovery” permission.
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Unified search</p>
        <Toggle
          label="New search switched on"
          hint="Events, places and organizers in one ranked search, with @handle for organizers. Off = the previous events-only search."
          checked={s.searchV2Enabled}
          disabled={!editable}
          onChange={(v) => set("searchV2Enabled", v)}
        />
        <div className="block text-sm">
          <label htmlFor="search-audience" className="block font-medium">
            Who gets the new search
          </label>
          <AudienceSelect
            id="search-audience"
            value={s.searchAudience}
            disabled={!editable}
            onChange={(v) => set("searchAudience", v)}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Signed-out visitors only see it when this is Everyone.
          </span>
        </div>
        <Toggle
          label="Organizer search (including @handle)"
          checked={s.organizerSearchEnabled}
          disabled={!editable}
          onChange={(v) => set("organizerSearchEnabled", v)}
        />
        <Toggle
          label="Place search"
          checked={s.placeSearchEnabled}
          disabled={!editable}
          onChange={(v) => set("placeSearchEnabled", v)}
        />
        <Toggle
          label="Record search analytics"
          hint="Normalised query text, result counts, latency and the first result opened. No user or device identifiers."
          checked={s.searchLoggingEnabled}
          disabled={!editable}
          onChange={(v) => set("searchLoggingEnabled", v)}
        />
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Recommendations and alerts</p>
        <Toggle
          label="Recommendation engine switched on"
          hint="Lets people follow organizers and places and turn on similar-event alerts; builds picks from new listings. Off stops the jobs and skips anything already queued."
          checked={s.recommendationsEnabled}
          disabled={!editable}
          onChange={(v) => set("recommendationsEnabled", v)}
        />
        <Toggle
          label="Shadow mode"
          hint="Picks and digests are calculated and counted on the Overview tab, but no notification is sent to anyone."
          checked={s.recommendationsShadowMode}
          disabled={!editable}
          onChange={(v) => set("recommendationsShadowMode", v)}
        />
        <div className="block text-sm">
          <label
            htmlFor="recommendations-audience"
            className="block font-medium"
          >
            Who gets alerts and picks
          </label>
          <AudienceSelect
            id="recommendations-audience"
            value={s.recommendationsAudience}
            disabled={!editable}
            onChange={(v) => set("recommendationsAudience", v)}
          />
        </div>
        <Toggle
          label="Opt-in prompts"
          hint="“Enjoy events like this?” after a ticket or RSVP, and “Like this place?” after a favorite, review or second check-in."
          checked={s.promptsEnabled}
          disabled={!editable}
          onChange={(v) => set("promptsEnabled", v)}
        />
        {s.searchAudience === "beta" || s.recommendationsAudience === "beta" ? (
          <label className="block text-sm">
            <span className="font-medium">Beta user ids</span>
            <span className="block text-xs text-muted-foreground">
              One user id per line (copy it from the user&apos;s admin page).
            </span>
            <textarea
              value={beta}
              disabled={!editable}
              onChange={(e) => setBeta(e.target.value)}
              rows={4}
              className={cn(input, "mt-1 font-mono text-xs")}
            />
          </label>
        ) : null}
        <Toggle
          label="Start from now"
          hint={`Only recommend listings published after this save. Current starting point: ${formatAccraTime(settings.generateWatermark)}.`}
          checked={resetWatermark}
          disabled={!editable}
          onChange={setResetWatermark}
        />
      </Card>

      <Card className="grid gap-4 p-4 md:grid-cols-2">
        <p className="text-sm font-semibold md:col-span-2">Limits</p>
        {NUMBERS.map((n) => (
          <label key={n.key} className="block text-sm">
            <span className="font-medium">{n.label}</span>
            {n.hint ? (
              <span className="block text-xs text-muted-foreground">
                {n.hint}
              </span>
            ) : null}
            <span className="mt-1 flex items-center gap-1.5">
              <input
                value={numbers[n.key]}
                onChange={(e) =>
                  setNumbers((prev) => ({ ...prev, [n.key]: e.target.value }))
                }
                disabled={!editable}
                inputMode="decimal"
                className={cn(input, "w-28")}
              />
              <span className="text-xs text-muted-foreground">{n.suffix}</span>
            </span>
          </label>
        ))}
      </Card>

      {editable ? (
        <Card className="space-y-3 p-4">
          <label className="block text-sm">
            <span className="font-medium">Reason for this change</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Open search to the pilot beta group"
              className={cn(input, "mt-1")}
            />
          </label>
          <div className="flex items-center gap-3">
            <Button
              onClick={save}
              disabled={pending || reason.trim().length < 5}
            >
              {pending ? "Saving…" : "Save settings"}
            </Button>
            {msg ? (
              <span
                className={cn(
                  "text-sm",
                  msg.ok ? "text-muted-foreground" : "text-destructive",
                )}
              >
                {msg.text}
              </span>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
