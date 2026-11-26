"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { formatOpsDateTime } from "@/lib/format";
import { updateShowcaseSettings } from "@/server/actions/showcase";
import type {
  ShowcaseAudience,
  ShowcaseSettings,
} from "@abonten/types/showcaseType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

// The programme switch: on/off, who sees the wall, beta testers, and the
// row sizes. Saving needs showcase.edit, a fresh sign-in (step-up) and a
// reason; every change is audited. Opening it to everyone asks first: the
// founder's step is to switch it on at about ten well-known names
// (docs/OPERATIONAL_DECISIONS_REQUIRED.md).
export function ShowcaseSettingsForm({
  settings,
  canEdit,
  stepUpFresh,
}: {
  settings: ShowcaseSettings;
  canEdit: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [audience, setAudience] = useState<ShowcaseAudience>(settings.audience);
  const [beta, setBeta] = useState(settings.betaUserIds.join("\n"));
  const [minPerRow, setMinPerRow] = useState(String(settings.minPerRow));
  const [maxPerRow, setMaxPerRow] = useState(String(settings.maxPerRow));
  const [reason, setReason] = useState("");
  const editable = canEdit && stepUpFresh;

  const save = () =>
    start(async () => {
      setMsg(null);
      if (
        enabled &&
        audience === "all" &&
        (!settings.enabled || settings.audience !== "all") &&
        !(await confirm(
          "Show the On Abonten wall to everyone? That includes signed-out visitors, on the website and in the app.",
          { confirmLabel: "Show to everyone" },
        ))
      ) {
        return;
      }
      const res = await updateShowcaseSettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        patch: {
          enabled,
          audience,
          betaUserIds: beta
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean),
          minPerRow: Number(minPerRow),
          maxPerRow: Number(maxPerRow),
        },
      }).catch(actionUnreachable);
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
    <Card className="max-w-3xl space-y-3 p-4">
      <p className="text-sm font-semibold">Settings</p>
      {canEdit && !stepUpFresh ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Changing these settings needs a fresh identity check.
          <StepUpButton next="/showcase" />
        </p>
      ) : null}
      {!canEdit ? (
        <p className="text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Edit the On
          Abonten showcase” permission.
        </p>
      ) : null}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          disabled={!editable}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>
          <span className="block">The wall is switched on</span>
          <span className="block text-xs text-muted-foreground">
            Off hides it everywhere (website landing page, Explore, the app and
            the “See all” page). The list here is kept.
          </span>
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium">Who sees it</span>
        <select
          value={audience}
          disabled={!editable}
          onChange={(e) => setAudience(e.target.value as ShowcaseAudience)}
          className={cn(input, "mt-1 w-64")}
        >
          <option value="staff">Staff only (active admins)</option>
          <option value="beta">Staff + beta users</option>
          <option value="all">Everyone</option>
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">
          Signed-out visitors and search engines see it only when this is
          Everyone.
        </span>
      </label>

      {audience === "beta" ? (
        <label className="block text-sm">
          <span className="font-medium">Beta user ids</span>
          <span className="block text-xs text-muted-foreground">
            One user id per line (copy it from the user&apos;s admin page).
          </span>
          <textarea
            value={beta}
            disabled={!editable}
            onChange={(e) => setBeta(e.target.value)}
            rows={3}
            className={cn(input, "mt-1 font-mono text-xs")}
          />
        </label>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Fewest per row</span>
          <span className="block text-xs text-muted-foreground">
            A row (Hosts, Places) shows only with at least this many that
            qualify. A wall of two or three names looks worse than none.
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={minPerRow}
            disabled={!editable}
            onChange={(e) => setMinPerRow(e.target.value)}
            className={cn(input, "mt-1 w-28")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Most per row</span>
          <span className="block text-xs text-muted-foreground">
            The moving rows carry at most this many; “See all” lists everyone.
          </span>
          <input
            type="number"
            min={4}
            max={60}
            value={maxPerRow}
            disabled={!editable}
            onChange={(e) => setMaxPerRow(e.target.value)}
            className={cn(input, "mt-1 w-28")}
          />
        </label>
      </div>

      {editable ? (
        <label className="block text-sm">
          <span className="font-medium">Reason for this change</span>
          <input
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Last changed {formatOpsDateTime(settings.updatedAt)} UTC. Every change
        is audited.
      </p>

      {editable ? (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={pending || reason.trim().length < 5}
            onClick={save}
          >
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
