"use client";

import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { updateFieldOpsSettings } from "@/server/actions";
import type { FieldOpsProgramSettings } from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

// Switches for parts of the programme that haven't shipped are shown locked
// with the phase that delivers them (and refused server-side too).
const LOCKED: {
  label: string;
  phase: string;
  value: (s: FieldOpsProgramSettings) => boolean;
}[] = [
  {
    label: "Commission generation (eligibility sweep)",
    phase: "Phase 3",
    value: (s) => s.commissionGenerationEnabled,
  },
  { label: "Payout batches", phase: "Phase 4", value: (s) => s.payoutsEnabled },
];

export function SettingsForm({
  settings,
  canManage,
  stepUpFresh,
}: {
  settings: FieldOpsProgramSettings;
  canManage: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(settings.programEnabled);
  const [workerUi, setWorkerUi] = useState(settings.workerUiEnabled);
  const [requirePhone, setRequirePhone] = useState(
    settings.requireMemberPhoneVerified,
  );
  const [holding, setHolding] = useState(String(settings.defaultHoldingDays));
  const [dupRadius, setDupRadius] = useState(String(settings.duplicateRadiusM));
  const [dupSim, setDupSim] = useState(
    String(settings.duplicateNameSimilarity),
  );
  const [maxDist, setMaxDist] = useState(String(settings.offlineMaxDistanceM));
  const [dailyCap, setDailyCap] = useState(String(settings.dailySubmissionCap));
  const [spot, setSpot] = useState((settings.spotCheckBps / 100).toString());
  const [grace, setGrace] = useState(String(settings.reviewGraceDays));
  const [retention, setRetention] = useState(
    String(settings.evidenceRetentionDays),
  );
  const [push, setPush] = useState(settings.notifyPushEnabled);
  const [reason, setReason] = useState("");

  const editable = canManage && stepUpFresh;

  const save = () =>
    start(async () => {
      setMsg(null);
      const res = await updateFieldOpsSettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        patch: {
          programEnabled: enabled,
          workerUiEnabled: workerUi,
          requireMemberPhoneVerified: requirePhone,
          defaultHoldingDays: Math.round(Number(holding)),
          duplicateRadiusM: Math.round(Number(dupRadius)),
          duplicateNameSimilarity: Number(dupSim),
          offlineMaxDistanceM: Math.round(Number(maxDist)),
          dailySubmissionCap: Math.round(Number(dailyCap)),
          spotCheckBps: Math.round(Number(spot) * 100),
          reviewGraceDays: Math.round(Number(grace)),
          evidenceRetentionDays: Math.round(Number(retention)),
          notifyPushEnabled: push,
        },
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setReason("");
        router.refresh();
      }
    });

  const field = (
    label: string,
    hint: string,
    value: string,
    set: (v: string) => void,
    suffix: string,
  ) => (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => set(e.target.value)}
          disabled={!editable}
          inputMode="decimal"
          className={cn(input, "w-32")}
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-4">
      {canManage && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing programme settings needs a fresh identity check.
          <StepUpButton next="/field-ops/settings" />
        </Card>
      ) : null}
      {!canManage ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Manage Field
          Ops” permission.
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Programme</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={enabled}
            disabled={!editable}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block">Programme switched on</span>
            <span className="block text-xs text-muted-foreground">
              Off: the Field work area is hidden from team members, nothing is
              submitted, no commissions are generated. Admin pages stay
              readable. The deployment flag FIELD_OPS_KILL_SWITCH overrides
              this.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={workerUi}
            disabled={!editable}
            onChange={(e) => setWorkerUi(e.target.checked)}
          />
          <span>
            <span className="block">Worker web area (/field) switched on</span>
            <span className="block text-xs text-muted-foreground">
              Off: team leads and members can&apos;t open /field (it 404s and
              the “Field work” link disappears) while the rest of the programme
              keeps running.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={requirePhone}
            disabled={!editable}
            onChange={(e) => setRequirePhone(e.target.checked)}
          />
          <span>
            <span className="block">Members need a verified phone</span>
            <span className="block text-xs text-muted-foreground">
              Also what lets the programme refuse an onboarding whose “owner”
              phone belongs to a team member.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={push}
            disabled={!editable}
            onChange={(e) => setPush(e.target.checked)}
          />
          <span>
            <span className="block">Send push notifications to members</span>
            <span className="block text-xs text-muted-foreground">
              Assignments, review results, commissions and announcements.
            </span>
          </span>
        </label>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Verification defaults</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "Holding period",
            "Days after a team lead verifies an onboarding before the commission is approved (a campaign can override).",
            holding,
            setHolding,
            "days",
          )}
          {field(
            "Spot-check share",
            "Share of passing onboardings sent to an admin for a look before the commission is approved.",
            spot,
            setSpot,
            "%",
          )}
          {field(
            "Offline GPS tolerance",
            "How far the member's phone may be from the business pin when they submit.",
            maxDist,
            setMaxDist,
            "m",
          )}
          {field(
            "Daily submission cap",
            "Most onboardings one member can submit per day.",
            dailyCap,
            setDailyCap,
            "per member",
          )}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Duplicate detection</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "Search radius",
            "Existing places within this distance are compared by name.",
            dupRadius,
            setDupRadius,
            "m",
          )}
          {field(
            "Name similarity threshold",
            "0 to 1. Higher = only near-identical names count as the same business.",
            dupSim,
            setDupSim,
            "",
          )}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Housekeeping</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "Review grace period",
            "Days after a campaign completes before open reviews close automatically.",
            grace,
            setGrace,
            "days",
          )}
          {field(
            "Evidence retention",
            "Photos of rejected or withdrawn onboardings are purged after this long.",
            retention,
            setRetention,
            "days",
          )}
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <p className="text-sm font-semibold">Not available yet</p>
        <ul className="space-y-1 text-sm">
          {LOCKED.map((l) => (
            <li
              key={l.label}
              className="flex items-center justify-between gap-3"
            >
              <span className="text-muted-foreground">{l.label}</span>
              <span className="text-xs text-muted-foreground">
                {l.value(settings) ? "on" : "off"} · {l.phase}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {editable ? (
        <Card className="space-y-2 p-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you changing these settings? (required, audited)"
            rows={2}
            className={input}
          />
          <Button disabled={pending || reason.trim().length < 3} onClick={save}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
          {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
