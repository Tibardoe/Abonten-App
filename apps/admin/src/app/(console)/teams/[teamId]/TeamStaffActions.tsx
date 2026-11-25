"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import {
  appointTeamOwner,
  deleteTeam,
  setTeamStatus,
} from "@/server/actions/teams";
import type { TeamPerson, TeamStatus } from "@abonten/types/teamType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

type Candidate = { person: TeamPerson; current: boolean; role: string };

const nameOf = (p: TeamPerson) => p.name ?? p.username ?? p.id.slice(0, 8);

/**
 * Admin › Teams › one team: pause it in a dispute, resume it, make a
 * current or former member an Owner (a team paused because its last
 * Owner's account closed), or delete it without its Owners (abuse, a legal
 * order). teams.manage, a fresh sign-in and a reason.
 */
export function TeamStaffActions({
  teamId,
  teamName,
  status,
  hasOwner,
  candidates,
  stepUpFresh,
}: {
  teamId: string;
  teamName: string;
  status: TeamStatus;
  hasOwner: boolean;
  candidates: Candidate[];
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [why, setWhy] = useState<"dispute" | "staff">("dispute");
  const [owner, setOwner] = useState(candidates[0]?.person.id ?? "");

  const done = (res: { status: number; message?: string }) => {
    setMsg({
      ok: res.status === 200,
      text: res.message ?? (res.status === 200 ? "Done." : "Couldn't do that."),
    });
    if (res.status === 200) {
      setReason("");
      router.refresh();
    }
  };

  const pause = () =>
    start(async () => {
      setMsg(null);
      if (
        !(await confirm(
          `Pause ${teamName}? Nobody can act for the team until it is resumed: no event or place changes, no money moves, no messages as the team.`,
          { confirmLabel: "Pause team" },
        ))
      ) {
        return;
      }
      done(
        await setTeamStatus({
          teamId,
          to: "frozen",
          why,
          reason: reason.trim(),
        }).catch(actionUnreachable),
      );
    });

  const resume = () =>
    start(async () => {
      setMsg(null);
      done(
        await setTeamStatus({
          teamId,
          to: "active",
          reason: reason.trim(),
        }).catch(actionUnreachable),
      );
    });

  const remove = () =>
    start(async () => {
      setMsg(null);
      if (
        !(await confirm(
          `Delete ${teamName}? Everyone is removed from it, its profile is scrubbed, its upcoming events with no tickets are cancelled and the rest archived, its places are unclaimed and its credit is closed. Sales and payout records stay. Every member is told. This can't be undone.`,
          { confirmLabel: "Delete team" },
        ))
      ) {
        return;
      }
      done(
        await deleteTeam({ teamId, reason: reason.trim() }).catch(
          actionUnreachable,
        ),
      );
    });

  const appoint = () =>
    start(async () => {
      setMsg(null);
      const who = candidates.find((c) => c.person.id === owner);
      if (!who) return;
      if (
        !(await confirm(
          `Make ${nameOf(who.person)} an Owner of ${teamName}? Owners can change members, the payout account and everything else.`,
          { confirmLabel: "Make Owner" },
        ))
      ) {
        return;
      }
      done(
        await appointTeamOwner({
          teamId,
          userId: owner,
          reason: reason.trim(),
        }).catch(actionUnreachable),
      );
    });

  if (!stepUpFresh) {
    return (
      <Card className="flex items-center gap-2 p-3 text-sm">
        Pausing, deleting a team or appointing an Owner needs a fresh identity
        check.
        <StepUpButton next={`/teams/${teamId}`} />
      </Card>
    );
  }

  const ready = reason.trim().length >= 5 && !pending;

  return (
    <Card className="space-y-3 p-4 text-sm">
      <p className="font-semibold">Staff actions</p>
      <label className="block space-y-1">
        <span className="text-muted-foreground">
          Reason (kept in the audit log)
        </span>
        <input
          className={input}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ticket number and what was agreed"
        />
      </label>

      {status === "active" ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${input} w-auto`}
            value={why}
            onChange={(e) => setWhy(e.target.value as "dispute" | "staff")}
            aria-label="Why the team is paused"
          >
            <option value="dispute">A dispute between members</option>
            <option value="staff">A staff hold</option>
          </select>
          <Button variant="outline" disabled={!ready} onClick={pause}>
            Pause team
          </Button>
        </div>
      ) : status === "frozen" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!ready || !hasOwner} onClick={resume}>
            Resume team
          </Button>
          {!hasOwner ? (
            <span className="text-muted-foreground">
              The team has no Owner: make someone an Owner below.
            </span>
          ) : null}
        </div>
      ) : null}

      {status !== "closed" && candidates.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${input} w-auto`}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            aria-label="Who becomes an Owner"
          >
            {candidates.map((c) => (
              <option key={c.person.id} value={c.person.id}>
                {nameOf(c.person)} ({c.current ? c.role : `former ${c.role}`})
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={!ready || !owner}
            onClick={appoint}
          >
            Make Owner
          </Button>
        </div>
      ) : null}

      {status !== "closed" ? (
        <div className="space-y-1 border-t border-border pt-3">
          <p className="text-muted-foreground">
            Delete the team without its Owners (abuse, a legal order). The same
            checks as when Owners delete it: refused while it owes attendees, a
            payout is moving, money is owed or a payment or promotion is
            running.
          </p>
          <Button variant="danger" disabled={!ready} onClick={remove}>
            Delete team
          </Button>
        </div>
      ) : null}

      {msg ? (
        <p className={msg.ok ? "text-emerald-700" : "text-destructive"}>
          {msg.text}
        </p>
      ) : null}
    </Card>
  );
}
