"use client";

import { Button } from "@/components/ui";
import { grantAdminRole, revokeAdminRole, setAdminUserStatus } from "@/server/actions";
import { ADMIN_ROLE_KEYS } from "@abonten/core/adminPermissions";
import type { AdminRoleKey } from "@abonten/types/adminTypes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RoleEditor({
  userId,
  currentRoles,
  status,
  isSelf,
  disabled,
}: {
  userId: string;
  currentRoles: AdminRoleKey[];
  status: "active" | "disabled";
  isSelf: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [role, setRole] = useState<AdminRoleKey>("moderator");
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ status: number; message?: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.message ?? (res.status === 200 ? "Done." : "Failed."));
      if (res.status === 200) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-1">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRoleKey)}
          disabled={disabled}
          className="rounded border border-border bg-background px-1 py-0.5"
        >
          {ADMIN_ROLE_KEYS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || disabled}
          onClick={() => run(() => grantAdminRole({ targetUserId: userId, roleKey: role }))}
        >
          Grant
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {currentRoles.map((r) => (
          <button
            key={r}
            type="button"
            disabled={pending || disabled}
            onClick={() => run(() => revokeAdminRole({ targetUserId: userId, roleKey: r }))}
            className="rounded bg-muted px-1.5 py-0.5 hover:bg-destructive/15 hover:text-destructive"
          >
            {r} ✕
          </button>
        ))}
      </div>
      {!isSelf && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || disabled}
          onClick={() =>
            run(() =>
              setAdminUserStatus({
                targetUserId: userId,
                status: status === "active" ? "disabled" : "active",
              }),
            )
          }
        >
          {status === "active" ? "Disable account" : "Re-enable account"}
        </Button>
      )}
      {msg ? <span className="text-muted-foreground">{msg}</span> : null}
    </div>
  );
}
