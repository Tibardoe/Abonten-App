"use client";

import { Button, Card, cn } from "@/components/ui";
import { setUserStatus } from "@/server/actions";
import type {
  AdminPermissionKey,
  UserAccountStatus,
} from "@abonten/types/adminTypes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function UserActions({
  userId,
  status,
  isAdmin,
  permissions,
  stepUpFresh,
}: {
  userId: string;
  status: UserAccountStatus;
  isAdmin: boolean;
  permissions: AdminPermissionKey[];
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );
  const can = (p: AdminPermissionKey) => permissions.includes(p);

  function act(next: UserAccountStatus) {
    if (!reason.trim()) {
      setMsg({ tone: "err", text: "A reason is required." });
      return;
    }
    if (
      !confirm(
        `Set this account to "${next}"? This is recorded in the audit log.`,
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const res = await setUserStatus({
        userId,
        status: next,
        reason: reason.trim(),
        expectedStatus: status,
      });
      if (res.status === 200) {
        setMsg({ tone: "ok", text: res.message ?? "Done." });
        setReason("");
        router.refresh();
      } else {
        setMsg({ tone: "err", text: res.message ?? "Action failed." });
        if (res.status === 409) router.refresh();
      }
    });
  }

  if (isAdmin) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        This account has admin roles. Remove them in Admin Settings before
        changing account status.
      </Card>
    );
  }

  return (
    <Card className="sticky top-2 space-y-3 p-4">
      <h3 className="text-sm font-semibold">Account actions</h3>
      {msg ? (
        <p
          className={cn(
            "text-sm",
            msg.tone === "ok" ? "text-success" : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      ) : null}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required, audited)…"
        rows={2}
        className="w-full rounded border border-border bg-background p-1.5 text-sm"
      />
      <div className="grid gap-1.5">
        {status !== "Suspended" && can("users.suspend") && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => act("Suspended")}
          >
            Suspend
          </Button>
        )}
        {status === "Suspended" && can("users.suspend") && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => act("Active")}
          >
            Unsuspend
          </Button>
        )}
        {status !== "Banned" && can("users.ban") && (
          <Button
            variant="danger"
            size="sm"
            disabled={pending || !stepUpFresh}
            title={stepUpFresh ? undefined : "Needs a fresh re-authentication"}
            onClick={() => act("Banned")}
          >
            Ban{stepUpFresh ? "" : " (re-auth required)"}
          </Button>
        )}
        {status !== "Active" && can("users.restore") && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => act("Active")}
          >
            Restore to active
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        No account is ever hard-deleted — financial and ticket history stays
        intact.
      </p>
    </Card>
  );
}
