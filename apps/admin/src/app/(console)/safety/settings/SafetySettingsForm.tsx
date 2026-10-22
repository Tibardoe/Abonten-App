"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { updateSafetySettings } from "@/server/actions/safety";
import type {
  SafetyAdminSettings,
  SafetyAudience,
} from "@abonten/types/safetyType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

type NumberKey =
  | "maxContacts"
  | "alertsWithSmsPerDay"
  | "invitesPerDay"
  | "checkInGraceMinutes"
  | "alertHours"
  | "shareMaxHours"
  | "locationRetentionDays"
  | "sessionRetentionDays";

const NUMBERS: {
  key: NumberKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  {
    key: "maxContacts",
    label: "Trusted contacts per person",
    hint: "Each one is texted an invite when added.",
    min: 1,
    max: 10,
  },
  {
    key: "alertsWithSmsPerDay",
    label: "Alerts that send texts, per person per day",
    hint: "Beyond this an alert still goes by push and email, and the app offers the person's own SMS. An alert is never refused.",
    min: 1,
    max: 50,
  },
  {
    key: "invitesPerDay",
    label: "Invite texts per person per day",
    hint: "Limits texting strangers through invites.",
    min: 1,
    max: 50,
  },
  {
    key: "checkInGraceMinutes",
    label: "Check-in grace, minutes",
    hint: "How long after the check-in time the contacts are alerted.",
    min: 1,
    max: 30,
  },
  {
    key: "alertHours",
    label: "An alert stays open for, hours",
    hint: "Without “I'm safe”. Contacts then see the last position for one more day.",
    min: 1,
    max: 72,
  },
  {
    key: "shareMaxHours",
    label: "Longest location share, hours",
    hint: "Shares end by themselves.",
    min: 1,
    max: 24,
  },
  {
    key: "locationRetentionDays",
    label: "Delete positions after, days",
    hint: "Counted from when the session closed (decision J2).",
    min: 1,
    max: 90,
  },
  {
    key: "sessionRetentionDays",
    label: "Delete sessions after, days",
    hint: "With who was told, the outbox and the timeline.",
    min: 30,
    max: 730,
  },
];

export function SafetySettingsForm({
  settings,
  killSwitch,
  canConfigure,
  stepUpFresh,
}: {
  settings: SafetyAdminSettings;
  killSwitch: boolean;
  canConfigure: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [audience, setAudience] = useState<SafetyAudience>(settings.audience);
  const [beta, setBeta] = useState(settings.betaUserIds.join("\n"));
  const [checkIn, setCheckIn] = useState(settings.checkInEnabled);
  const [share, setShare] = useState(settings.shareEnabled);
  const [eventTeam, setEventTeam] = useState(settings.eventTeamAlertsEnabled);
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
          "Open Safety to everyone? Before this, legal items I1 to I3 must be Decided, the privacy policy and the store privacy answers updated, and the help page published.",
          { confirmLabel: "Open to everyone" },
        ))
      ) {
        return;
      }
      if (
        eventTeam &&
        !settings.eventTeamAlertsEnabled &&
        !(await confirm(
          "Let people tell an event's organizer about their alert? Legal item I4 must be Decided and organizers told what they may receive.",
          { confirmLabel: "Turn on" },
        ))
      ) {
        return;
      }
      const res = await updateSafetySettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        patch: {
          enabled,
          audience,
          betaUserIds: beta
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean),
          checkInEnabled: checkIn,
          shareEnabled: share,
          eventTeamAlertsEnabled: eventTeam,
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
          SAFETY_KILL_SWITCH is set on the web deployment. Nobody can start a
          new SOS, check-in or share until it is removed, whatever these
          settings say. Open sessions keep working.
        </Card>
      ) : null}
      {canConfigure && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing these settings needs a fresh identity check.
          <StepUpButton next="/safety/settings" />
        </Card>
      ) : null}
      {!canConfigure ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Configure
          Abonten Safety” permission.
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Who can use Safety</p>
        {toggle(
          enabled,
          setEnabled,
          "Abonten Safety switched on",
          "Off hides SOS, check-ins and shares on the website and in the app. Sessions already open keep working until they end, and contacts can still open their links.",
        )}
        <div className="text-sm">
          <label htmlFor="safety-audience" className="block font-medium">
            Audience
          </label>
          <select
            id="safety-audience"
            value={audience}
            disabled={!editable}
            onChange={(e) => setAudience(e.target.value as SafetyAudience)}
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
          checkIn,
          setCheckIn,
          "“Check in on me”",
          "A timer that alerts the contacts if it is missed.",
        )}
        {toggle(
          share,
          setShare,
          "“Share my location”",
          "A live location share with chosen contacts, with no alarm.",
        )}
        {toggle(
          eventTeam,
          setEventTeam,
          "“Tell the event team”",
          "From an open alert at an event the person has a ticket for, the organizer can be told (push and in-app). Off until legal item I4 is Decided.",
        )}
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
