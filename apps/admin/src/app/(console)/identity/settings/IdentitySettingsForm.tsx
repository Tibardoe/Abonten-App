"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { updateIdentitySettings } from "@/server/actions/identity";
import type {
  IdentityAdminSettings,
  IdentityAudience,
} from "@abonten/types/identityType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

type NumberKey =
  | "attemptsPerDay"
  | "attemptsPer30Days"
  | "minimumAge"
  | "validityMonths"
  | "linkExpiryHours"
  | "retentionDaysUnsuccessful"
  | "retentionDaysAfterDeletion"
  | "retentionDaysFraud";

const NUMBERS: {
  key: NumberKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  {
    key: "attemptsPerDay",
    label: "Attempts per person per day",
    hint: "Each attempt is a paid check with the provider.",
    min: 1,
    max: 20,
  },
  {
    key: "attemptsPer30Days",
    label: "Attempts per person per 30 days",
    hint: "Beyond this the person is asked to contact support.",
    min: 1,
    max: 60,
  },
  {
    key: "minimumAge",
    label: "Minimum age",
    hint: "Younger people are refused, even when the check is clear.",
    min: 13,
    max: 25,
  },
  {
    key: "validityMonths",
    label: "A check lasts, months",
    hint: "Or until the document expires, whichever is first.",
    min: 6,
    max: 120,
  },
  {
    key: "linkExpiryHours",
    label: "The provider link lasts, hours",
    hint: "An unfinished attempt expires after this.",
    min: 1,
    max: 168,
  },
  {
    key: "retentionDaysUnsuccessful",
    label: "Delete unsuccessful checks after, days",
    hint: "Rejected, failed, cancelled and expired attempts.",
    min: 30,
    max: 3650,
  },
  {
    key: "retentionDaysAfterDeletion",
    label: "Keep after the account is deleted, days",
    hint: "So a deleted account can still be traced after an incident (legal item K2).",
    min: 30,
    max: 3650,
  },
  {
    key: "retentionDaysFraud",
    label: "Keep checks linked to fraud, days",
    hint: "Revoked or blocked checks, and the accounts they match.",
    min: 365,
    max: 3650,
  },
];

type ToggleKey =
  | "requireForPayouts"
  | "requireForPlaceClaims"
  | "requireForVerifiedBadges"
  | "requireForPaidEvents";

const REQUIREMENTS: { key: ToggleKey; label: string; hint: string }[] = [
  {
    key: "requireForPayouts",
    label: "Adding a payout account and being paid",
    hint: "Payouts that staff create or send are held too.",
  },
  {
    key: "requireForPlaceClaims",
    label: "Having a place claim approved",
    hint: "The claimant must be checked before the place is handed over.",
  },
  {
    key: "requireForVerifiedBadges",
    label: "Getting a Verified badge",
    hint: "For the organizer, or the place owner.",
  },
  {
    key: "requireForPaidEvents",
    label: "Selling tickets",
    hint: "Free events stay open to everyone.",
  },
];

export function IdentitySettingsForm({
  settings,
  killSwitch,
  canConfigure,
  stepUpFresh,
}: {
  settings: IdentityAdminSettings;
  killSwitch: boolean;
  canConfigure: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [audience, setAudience] = useState<IdentityAudience>(settings.audience);
  const [beta, setBeta] = useState(settings.betaUserIds.join("\n"));
  const [autoApprove, setAutoApprove] = useState(settings.autoApproveClear);
  const [requires, setRequires] = useState<Record<ToggleKey, boolean>>({
    requireForPayouts: settings.requireForPayouts,
    requireForPlaceClaims: settings.requireForPlaceClaims,
    requireForVerifiedBadges: settings.requireForVerifiedBadges,
    requireForPaidEvents: settings.requireForPaidEvents,
  });
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
        !(await confirm(
          "Open identity checks to everyone? Before this, legal items K1 to K3 and K6 must be Decided, the privacy policy updated and the Smile ID contract signed.",
          { confirmLabel: "Open to everyone" },
        ))
      ) {
        return;
      }
      const newlyRequired = REQUIREMENTS.filter(
        (r) => requires[r.key] && !settings[r.key],
      );
      if (
        newlyRequired.length > 0 &&
        !(await confirm(
          `Require a checked identity for: ${newlyRequired.map((r) => r.label.toLowerCase()).join("; ")}? People in the audience who aren't checked are stopped at once (legal item K5).`,
          { confirmLabel: "Require it" },
        ))
      ) {
        return;
      }
      const res = await updateIdentitySettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        patch: {
          enabled,
          audience,
          betaUserIds: beta
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean),
          autoApproveClear: autoApprove,
          ...requires,
          ...Object.fromEntries(
            NUMBERS.map((n) => [n.key, Number(numbers[n.key])]),
          ),
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

  const toggle = (
    checked: boolean,
    set: (v: boolean) => void,
    title: string,
    hint: string,
  ) => (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={!editable}
        onChange={(e) => set(e.target.checked)}
      />
      <span>
        <span className="block">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="max-w-3xl space-y-4">
      {killSwitch ? (
        <Card className="border-destructive/40 p-3 text-sm">
          IDENTITY_KILL_SWITCH is set on the web deployment. Nobody can start a
          check and nothing requires one until it is removed, whatever these
          settings say. Checks already approved keep their badge.
        </Card>
      ) : null}
      {canConfigure && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing these settings needs a fresh identity check.
          <StepUpButton next="/identity/settings" />
        </Card>
      ) : null}
      {!canConfigure ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Configure
          identity verification” permission.
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Who can verify</p>
        {toggle(
          enabled,
          setEnabled,
          "Identity verification switched on",
          "Off hides it on the website and in the app, and nothing requires it. Checks already approved keep their badge.",
        )}
        <div className="text-sm">
          <label htmlFor="identity-audience" className="block font-medium">
            Audience
          </label>
          <select
            id="identity-audience"
            value={audience}
            disabled={!editable}
            onChange={(e) => setAudience(e.target.value as IdentityAudience)}
            className={cn(input, "mt-1 w-64")}
          >
            <option value="staff">Staff only (active admins)</option>
            <option value="beta">Staff + beta users</option>
            <option value="all">Everyone signed in</option>
          </select>
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
        {toggle(
          autoApprove,
          setAutoApprove,
          "Approve clear checks automatically",
          "Off sends every check to the review queue, even when the provider is sure.",
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Require a checked identity for</p>
        <p className="text-xs text-muted-foreground">
          Only for people in the audience above, and only while the programme is
          on.
        </p>
        {REQUIREMENTS.map((r) => (
          <div key={r.key}>
            {toggle(
              requires[r.key],
              (v) => setRequires((prev) => ({ ...prev, [r.key]: v })),
              r.label,
              r.hint,
            )}
          </div>
        ))}
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
