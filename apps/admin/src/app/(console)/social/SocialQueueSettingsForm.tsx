"use client";

import { Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { formatOpsDateTime } from "@/lib/format";
import { updateSocialQueueSettings } from "@/server/actions/social";
import type { SocialQueueSettings } from "@abonten/types/socialQueueType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

export function SocialQueueSettingsForm({
  settings,
  canManage,
}: {
  settings: SocialQueueSettings;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [dailyCap, setDailyCap] = useState(String(settings.dailyCap));
  const [excluded, setExcluded] = useState(
    settings.excludedAccountIds.join("\n"),
  );

  const save = () =>
    start(async () => {
      setMsg(null);
      const res = await updateSocialQueueSettings({
        expectedUpdatedAt: settings.updatedAt,
        patch: {
          enabled,
          dailyCap: Number(dailyCap),
          excludedAccountIds: excluded
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean),
        },
      }).catch(actionUnreachable);
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Saved." : "Couldn't save."),
      });
      if (res.status === 200) router.refresh();
    });

  return (
    <Card className="max-w-3xl space-y-3 p-4">
      <p className="text-sm font-semibold">Queue settings</p>
      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Work the social
          queue” permission.
        </p>
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canManage}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Queue new listings and roundups
          <span className="block text-xs text-muted-foreground">
            Off stops the two jobs from adding anything. What is queued stays.
          </span>
        </span>
      </label>
      <label className="block text-sm">
        <span className="font-medium">New listings per day</span>
        <span className="block text-xs text-muted-foreground">
          Events and places together, counted on Accra's calendar; the rest wait
          for the next day (an event that has started by then is left out).
          Roundups don't count. 0 queues no new listings.
        </span>
        <input
          type="number"
          min={0}
          max={200}
          value={dailyCap}
          disabled={!canManage}
          onChange={(e) => setDailyCap(e.target.value)}
          className={cn(input, "mt-1 w-28")}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Accounts never posted</span>
        <span className="block text-xs text-muted-foreground">
          User ids, one per line. Their events and places are never queued (the
          App Review sample organizer is here).
        </span>
        <textarea
          value={excluded}
          disabled={!canManage}
          onChange={(e) => setExcluded(e.target.value)}
          rows={3}
          className={cn(input, "mt-1 font-mono text-xs")}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Listings published up to {formatOpsDateTime(settings.queueWatermark)}{" "}
        UTC have been looked at. Settings last changed{" "}
        {formatOpsDateTime(settings.updatedAt)} UTC.
      </p>
      {canManage ? (
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" disabled={pending} onClick={save}>
            Save settings
          </Button>
          {msg ? (
            <span
              className={cn(
                "text-sm",
                msg.ok ? "text-success" : "text-destructive",
              )}
              aria-live="polite"
            >
              {msg.text}
            </span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
