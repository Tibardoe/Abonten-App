"use client";

import { Button, Card, cn } from "@/components/ui";
import {
  addFieldOpsTeamMember,
  setFieldOpsTeamMemberRole,
  setFieldOpsTeamMemberStatus,
} from "@/server/actions";
import type {
  FieldOpsMemberRole,
  FieldOpsMemberStatus,
} from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

const ROLES: { value: FieldOpsMemberRole; label: string }[] = [
  { value: "team_lead", label: "Team lead" },
  { value: "offline_member", label: "Offline member (field)" },
  { value: "online_member", label: "Online member (remote)" },
  { value: "content_creator", label: "Content creator" },
];

/** Add by existing user id (copy it from the Users module) or invite by phone. */
export function AddMemberForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"user" | "phone">("phone");
  const [userId, setUserId] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<FieldOpsMemberRole>("offline_member");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setMsg(null);
      const res = await addFieldOpsTeamMember({
        campaignId,
        role,
        userId: mode === "user" ? userId.trim() : null,
        invitedPhoneE164: mode === "phone" ? phone.trim() : null,
        fullName: fullName.trim() || null,
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setUserId("");
        setPhone("");
        setFullName("");
        router.refresh();
      }
    });

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-semibold">Add a team member</p>
      <p className="text-xs text-muted-foreground">
        Members are ordinary Abonten accounts. Invite by phone: the membership
        binds itself when they sign in to Abonten with that (verified) number
        and open the Field work area. Or paste the user id of an existing
        account from the Users module.
      </p>
      <div className="flex gap-1">
        {(["phone", "user"] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded px-2 py-1 text-xs",
              mode === m
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {m === "phone" ? "By phone" : "By user id"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {mode === "phone" ? (
          <label className="block text-sm">
            <span className="font-medium">Phone (international)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+233241234567"
              className={cn(input, "mt-1")}
            />
          </label>
        ) : (
          <label className="block text-sm">
            <span className="font-medium">User id</span>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="uuid"
              className={cn(input, "mt-1 font-mono text-xs")}
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="font-medium">Name (optional)</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as FieldOpsMemberRole)}
            className={cn(input, "mt-1")}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={
            pending ||
            (mode === "phone"
              ? phone.trim().length < 8
              : userId.trim().length < 30)
          }
          onClick={submit}
        >
          {pending ? "Adding…" : mode === "phone" ? "Invite" : "Add member"}
        </Button>
        {msg ? (
          <span className="text-xs text-muted-foreground">{msg}</span>
        ) : null}
      </div>
    </Card>
  );
}

export function MemberRowActions({
  memberId,
  status,
  role,
}: {
  memberId: string;
  status: FieldOpsMemberStatus;
  role: FieldOpsMemberRole;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<"status" | "role" | null>(null);
  const [target, setTarget] = useState<string>("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (status === "left") return null;

  const statusTargets: {
    value: "active" | "suspended" | "left";
    label: string;
  }[] =
    status === "invited"
      ? [{ value: "left", label: "Withdraw invitation" }]
      : status === "active"
        ? [
            { value: "suspended", label: "Suspend" },
            { value: "left", label: "Remove from team" },
          ]
        : [
            { value: "active", label: "Reinstate" },
            { value: "left", label: "Remove from team" },
          ];

  if (open === null) {
    return (
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setOpen("status");
            setTarget(statusTargets[0].value);
            setMsg(null);
          }}
        >
          Status…
        </Button>
        {status !== "invited" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen("role");
              setTarget(role);
              setMsg(null);
            }}
          >
            Role…
          </Button>
        ) : null}
        {msg ? (
          <span className="text-xs text-muted-foreground">{msg}</span>
        ) : null}
      </div>
    );
  }

  const confirm = () =>
    start(async () => {
      const res =
        open === "status"
          ? await setFieldOpsTeamMemberStatus({
              memberId,
              status: target as "active" | "suspended" | "left",
              reason: reason.trim(),
            })
          : await setFieldOpsTeamMemberRole({
              memberId,
              role: target as FieldOpsMemberRole,
              reason: reason.trim(),
            });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setOpen(null);
        setReason("");
        router.refresh();
      }
    });

  return (
    <div className="space-y-1">
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className={cn(input, "text-xs")}
      >
        {open === "status"
          ? statusTargets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))
          : ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
      </select>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why? (required, audited)"
        rows={2}
        className={cn(input, "text-xs")}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          disabled={pending || reason.trim().length < 3}
          onClick={confirm}
        >
          {pending ? "Saving…" : "Confirm"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
          Cancel
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
