"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { updateTeamSettings } from "@/server/actions/teams";
import type {
  TeamAdminSettings,
  TeamAudience,
  TeamLaunchReadiness,
} from "@abonten/types/teamType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

export function TeamSettingsForm({
  settings,
  killSwitch,
  readiness,
  canConfigure,
  stepUpFresh,
}: {
  settings: TeamAdminSettings;
  killSwitch: boolean;
  readiness: TeamLaunchReadiness;
  canConfigure: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [audience, setAudience] = useState<TeamAudience>(settings.audience);
  const [beta, setBeta] = useState(settings.betaUserIds.join("\n"));
  const [maxTeams, setMaxTeams] = useState(String(settings.maxTeamsCreated));
  const [maxMembers, setMaxMembers] = useState(String(settings.maxMembers));
  const [inviteHours, setInviteHours] = useState(String(settings.inviteHours));
  const [texts, setTexts] = useState(String(settings.textsPerTeamPerDay));
  const [termsVersion, setTermsVersion] = useState(settings.termsVersion ?? "");
  const [termsPath, setTermsPath] = useState(settings.termsPath);
  const [clearance, setClearance] = useState(false);
  const [reason, setReason] = useState("");
  const cleared = !!settings.launchClearedAt;
  const openingToAll = enabled && audience === "all";
  const editable = canConfigure && stepUpFresh;

  const save = () =>
    start(async () => {
      setMsg(null);
      if (
        enabled &&
        audience === "all" &&
        (!settings.enabled || settings.audience !== "all") &&
        !(await confirm(
          "Open team accounts to everyone? Every new team will accept the team terms, and Owners of existing teams will be asked to. List the help page (organizers/team-accounts) in the same release.",
          { confirmLabel: "Open to everyone" },
        ))
      ) {
        return;
      }
      const res = await updateTeamSettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        patch: {
          enabled,
          audience,
          betaUserIds: beta
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean),
          maxTeamsCreated: Number(maxTeams),
          maxMembers: Number(maxMembers),
          inviteHours: Number(inviteHours),
          textsPerTeamPerDay: Number(texts),
          termsVersion: termsVersion.trim() || null,
          termsPath: termsPath.trim() || "/legal/terms",
        },
        confirmLaunchClearance: clearance || undefined,
      }).catch(actionUnreachable);
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Saved." : "Couldn't save."),
      });
      if (res.status === 200) {
        setReason("");
        setClearance(false);
        router.refresh();
      }
    });

  const number = (
    label: string,
    value: string,
    set: (v: string) => void,
    min: number,
    max: number,
    help: string,
  ) => (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={!editable}
        onChange={(e) => set(e.target.value)}
        className={cn(input, "mt-1")}
      />
      <span className="mt-1 block text-xs text-muted-foreground">{help}</span>
    </label>
  );

  return (
    <div className="max-w-3xl space-y-4">
      {killSwitch ? (
        <Card className="border-destructive/40 p-3 text-sm">
          TEAMS_KILL_SWITCH is set on the web deployment. Nobody can make a
          team, invite or accept an invitation until it is removed, whatever
          these settings say. Members can still leave and Owners can still
          remove members.
        </Card>
      ) : null}
      {canConfigure && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing these settings needs a fresh identity check.
          <StepUpButton next="/teams" />
        </Card>
      ) : null}
      {!canConfigure ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Configure teams”
          permission.
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Who can make teams</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={enabled}
            disabled={!editable}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block">Team accounts switched on</span>
            <span className="block text-xs text-muted-foreground">
              Off stops new teams and new invitations. Teams that exist stay
              visible to their members, who can still answer invitations and
              leave, so nobody is trapped in a team.
            </span>
          </span>
        </label>
        <div className="text-sm">
          <label htmlFor="teams-audience" className="block font-medium">
            Audience
          </label>
          <select
            id="teams-audience"
            value={audience}
            disabled={!editable}
            onChange={(e) => setAudience(e.target.value as TeamAudience)}
            className={cn(input, "mt-1 w-64")}
          >
            <option value="staff">Staff only (active admins)</option>
            <option value="beta">Staff + beta users</option>
            <option value="all">Everyone</option>
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Who may make a team and invite. Anyone can answer an invitation sent
            to them.
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
      </Card>

      <Card className="grid gap-4 p-4 md:grid-cols-2">
        {number(
          "Teams one person may make",
          maxTeams,
          setMaxTeams,
          1,
          50,
          "A brake on throwaway teams. Joining other teams is not limited by this.",
        )}
        {number(
          "Members per team, at most",
          maxMembers,
          setMaxMembers,
          2,
          500,
          "Members plus invitations still waiting.",
        )}
        {number(
          "Hours to accept an invitation",
          inviteHours,
          setInviteHours,
          1,
          720,
          "168 = a week. Then the invitation runs out.",
        )}
        {number(
          "Invitation texts per team per day",
          texts,
          setTexts,
          0,
          200,
          "Decision X44: Abonten pays the text to a number with no account. 0 stops texts; invitations to accounts still work.",
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Team terms (legal item N4)</p>
        <p className="text-xs text-muted-foreground">
          Leave the version empty until counsel has approved the team terms and
          they are published on the website. With a version set, whoever makes a
          team accepts it for the team, every Owner of an existing team is asked
          to, and a team&apos;s payouts wait until one Owner has. Changing the
          version asks everyone again.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Terms version</span>
            <input
              value={termsVersion}
              disabled={!editable}
              placeholder="e.g. 2026-12-01"
              onChange={(e) => setTermsVersion(e.target.value)}
              className={cn(input, "mt-1")}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Where they are read</span>
            <input
              value={termsPath}
              disabled={!editable}
              onChange={(e) => setTermsPath(e.target.value)}
              className={cn(input, "mt-1 font-mono text-xs")}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              A path on the website, e.g. /legal/terms#team-accounts.
            </span>
          </label>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Before opening to everyone</p>
        <ul className="space-y-1 text-sm">
          <li>
            {readiness.termsPublished ? "✓" : "✗"} Team terms published (version
            set above).
          </li>
          <li>
            {cleared ? "✓" : "✗"} Counsel approved the team terms (N4), the ID
            checks and consent for Owners and Finance (N5), the badge wording
            for teams (N9) and 18 as the minimum age (K7)
            {cleared
              ? ` — recorded ${new Date(
                  settings.launchClearedAt as string,
                ).toLocaleDateString("en-GB")}${
                  readiness.clearedByName
                    ? ` by ${readiness.clearedByName}`
                    : ""
                }.`
              : "."}
          </li>
          <li>
            {readiness.identity?.enabled &&
            readiness.identity.requireForPayouts &&
            readiness.identity.audience === "all"
              ? "✓"
              : "⚠"}{" "}
            ID checks required for payouts for everyone (how Owners and Finance
            are checked, X5). Not required to open, but without them a
            team&apos;s money moves without an ID check, as a person&apos;s does
            today.
          </li>
        </ul>
        {!cleared ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={clearance}
              disabled={!editable}
              onChange={(e) => setClearance(e.target.checked)}
            />
            <span>
              Counsel has approved N4, N5, N9 and K7 (Decided in
              docs/LEGAL_REVIEW_REQUIRED.md). Recorded with my name, the time
              and the reason below.
            </span>
          </label>
        ) : null}
        {openingToAll && (!readiness.termsPublished || !cleared) ? (
          <p className="text-xs text-destructive">
            “Everyone” is refused until both of the first two are done.
          </p>
        ) : null}
      </Card>

      {editable ? (
        <Card className="space-y-2 p-4">
          <label className="block text-sm">
            <span className="font-medium">Reason for this change</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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
