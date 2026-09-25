"use client";

import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { updateWeeklySettings } from "@/server/actions/weekly";
import type { WeeklyAudience, WeeklySettings } from "@abonten/types/weeklyType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

type NumberKey =
  | "defaultPublishHourLocal"
  | "maxItemsPerSection"
  | "maxPerOrganizerPerSection"
  | "exposureLookbackEditions"
  | "editionRetentionWeeks";

const NUMBERS: {
  key: NumberKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  {
    key: "defaultPublishHourLocal",
    label: "Suggested publishing hour",
    hint: "On the area's own clock (its market's zone), on the week's Monday, offered when scheduling.",
    min: 0,
    max: 23,
  },
  {
    key: "maxItemsPerSection",
    label: "Listings per section, at most",
    hint: "Keeps sections easy to scan.",
    min: 1,
    max: 30,
  },
  {
    key: "maxPerOrganizerPerSection",
    label: "Events per organizer per section",
    hint: "More than this shows a warning in the editor. It never blocks publishing.",
    min: 1,
    max: 10,
  },
  {
    key: "exposureLookbackEditions",
    label: "Recently featured check",
    hint: "Warn when a listing was in this many previous editions for the same area. 0 turns the check off.",
    min: 0,
    max: 12,
  },
  {
    key: "editionRetentionWeeks",
    label: "Archive editions after",
    hint: "Weeks. Archived editions stay in the console but are no longer shown publicly.",
    min: 4,
    max: 520,
  },
];

export function WeeklySettingsForm({
  settings,
  killSwitch,
  canConfigure,
  stepUpFresh,
}: {
  settings: WeeklySettings;
  killSwitch: boolean;
  canConfigure: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [audience, setAudience] = useState<WeeklyAudience>(settings.audience);
  const [teaser, setTeaser] = useState(settings.teaserEnabled);
  const [beta, setBeta] = useState(settings.betaUserIds.join("\n"));
  const [numbers, setNumbers] = useState<Record<NumberKey, string>>(
    Object.fromEntries(
      NUMBERS.map((n) => [n.key, String(settings[n.key])]),
    ) as Record<NumberKey, string>,
  );
  const [reason, setReason] = useState("");
  const editable = canConfigure && stepUpFresh;

  const save = () =>
    start(async () => {
      setMsg(null);
      if (
        enabled &&
        audience === "all" &&
        (!settings.enabled || settings.audience !== "all") &&
        !window.confirm(
          "This makes published editions visible to everyone, including signed-out visitors, on web and in the app. Continue?",
        )
      ) {
        return;
      }
      const res = await updateWeeklySettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        patch: {
          enabled,
          audience,
          teaserEnabled: teaser,
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
        router.refresh();
      }
    });

  return (
    <div className="max-w-3xl space-y-4">
      {killSwitch ? (
        <Card className="border-destructive/40 p-3 text-sm">
          WEEKLY_KILL_SWITCH is set on the web deployment. Abonten Weekly is
          hidden everywhere until it is removed, whatever these settings say.
        </Card>
      ) : null}
      {canConfigure && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing these settings needs a fresh identity check.
          <StepUpButton next="/weekly/settings" />
        </Card>
      ) : null}
      {!canConfigure ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Configure
          Abonten Weekly” permission.
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Visibility</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={enabled}
            disabled={!editable}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block">Abonten Weekly switched on</span>
            <span className="block text-xs text-muted-foreground">
              Off hides the pages, the Explore teaser and the app screen for
              everyone. Editions and drafts are kept.
            </span>
          </span>
        </label>
        <div className="text-sm">
          <label htmlFor="weekly-audience" className="block font-medium">
            Who can see published editions
          </label>
          <select
            id="weekly-audience"
            value={audience}
            disabled={!editable}
            onChange={(e) => setAudience(e.target.value as WeeklyAudience)}
            className={cn(input, "mt-1 w-64")}
          >
            <option value="staff">Staff only (active admins)</option>
            <option value="beta">Staff + beta users</option>
            <option value="all">Everyone</option>
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Signed-out visitors, search engines and link previews only see
            editions when this is Everyone.
          </span>
        </div>
        {audience === "beta" ? (
          <label className="block text-sm">
            <span className="font-medium">Beta user ids</span>
            <span className="block text-xs text-muted-foreground">
              One user id per line (copy it from the user&apos;s admin page).
            </span>
            <textarea
              value={beta}
              disabled={!editable}
              rows={4}
              onChange={(e) => setBeta(e.target.value)}
              className={cn(input, "mt-1 font-mono text-xs")}
            />
          </label>
        ) : null}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={teaser}
            disabled={!editable}
            onChange={(e) => setTeaser(e.target.checked)}
          />
          <span>
            <span className="block">Teaser on Explore</span>
            <span className="block text-xs text-muted-foreground">
              A small “Abonten Weekly” card at the top of Explore on web and in
              the app, shown only while this week&apos;s edition is out.
            </span>
          </span>
        </label>
      </Card>

      <Card className="grid gap-4 p-4 md:grid-cols-2">
        {NUMBERS.map((n) => (
          <label key={n.key} className="block text-sm">
            <span className="font-medium">{n.label}</span>
            <input
              type="number"
              min={n.min}
              max={n.max}
              value={numbers[n.key]}
              disabled={!editable}
              onChange={(e) =>
                setNumbers((prev) => ({ ...prev, [n.key]: e.target.value }))
              }
              className={cn(input, "mt-1")}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {n.hint}
            </span>
          </label>
        ))}
      </Card>

      {editable ? (
        <Card className="space-y-2 p-4">
          <label className="block text-sm">
            <span className="font-medium">Reason for this change</span>
            <input
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              className={cn(input, "mt-1")}
            />
          </label>
          <div className="flex items-center gap-2">
            <Button
              disabled={pending || reason.trim().length < 5}
              onClick={save}
            >
              {pending ? "Saving…" : "Save settings"}
            </Button>
            {msg ? (
              <span
                role={msg.ok ? "status" : "alert"}
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
