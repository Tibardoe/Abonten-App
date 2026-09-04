"use client";

import { setRolePermission } from "@/server/actions";
import type { RoleMatrix } from "@abonten/types/adminTypes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Runtime editor for the admin_role_permission matrix. super_admin's
// column is locked (all-on, read-only) — the DB trigger + resolveAdminContext
// both enforce that too. Editing needs settings.manage + a fresh step-up.
export function RoleMatrixEditor({
  matrix,
  canEdit,
}: {
  matrix: RoleMatrix;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [grants, setGrants] = useState<Record<string, string[]>>(matrix.grants);
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const isLocked = (roleKey: string) => matrix.lockedRoles.includes(roleKey);
  const has = (roleKey: string, permKey: string) =>
    isLocked(roleKey) || (grants[roleKey] ?? []).includes(permKey);

  function toggle(roleKey: string, permKey: string, next: boolean) {
    if (!canEdit || isLocked(roleKey) || pending) return;
    const cell = `${roleKey}:${permKey}`;
    setBusyCell(cell);
    setMsg(null);
    start(async () => {
      const res = await setRolePermission({
        roleKey,
        permissionKey: permKey,
        enabled: next,
      });
      setBusyCell(null);
      if (res.status === 200 && res.data) {
        const next = res.data.grants;
        setGrants((g) => ({ ...g, [roleKey]: next }));
        router.refresh();
      } else {
        setMsg(res.message ?? "Update failed.");
      }
    });
  }

  return (
    <div className="space-y-2">
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Read-only — editing the matrix needs the <code>settings.manage</code>{" "}
          permission and a fresh identity confirmation.
        </p>
      )}
      {msg ? <p className="text-xs text-destructive">{msg}</p> : null}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 z-10 bg-muted/50 p-2 text-left font-semibold">
                Permission
              </th>
              {matrix.roles.map((r) => (
                <th
                  key={r.key}
                  className="whitespace-nowrap p-2 text-center font-semibold"
                  title={r.description ?? undefined}
                >
                  {r.key}
                  {isLocked(r.key) && (
                    <span className="ml-1 text-muted-foreground">🔒</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.permissions.map((p) => (
              <tr
                key={p.key}
                className="border-t border-border hover:bg-muted/30"
              >
                <td className="sticky left-0 z-10 bg-background p-2">
                  <span className="font-mono">{p.key}</span>
                  <span className="ml-2 text-muted-foreground">{p.label}</span>
                </td>
                {matrix.roles.map((r) => {
                  const cell = `${r.key}:${p.key}`;
                  return (
                    <td key={r.key} className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={has(r.key, p.key)}
                        disabled={
                          !canEdit ||
                          isLocked(r.key) ||
                          (pending && busyCell !== cell)
                        }
                        onChange={(e) =>
                          toggle(r.key, p.key, e.currentTarget.checked)
                        }
                        className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Changes take effect on each admin&apos;s next request. Every toggle is
        written to <code>admin_audit_log</code>.
      </p>
    </div>
  );
}
