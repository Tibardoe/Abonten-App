"use client";

import { Button, cn } from "@/components/ui";
import { applyModeration } from "@/server/actions";
import type {
  AdminPermissionKey,
  ModeratableTargetType,
  ModerationState,
} from "@abonten/types/adminTypes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ContentActions({
  targetType,
  targetId,
  state,
  permissions,
}: {
  targetType: ModeratableTargetType;
  targetId: string;
  state: ModerationState | null;
  permissions: AdminPermissionKey[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const can = (p: AdminPermissionKey) => permissions.includes(p);
  const isDown = state === "hidden" || state === "removed";

  function run(action: "hide" | "remove" | "restore" | "restrict") {
    setErr(null);
    start(async () => {
      try {
        const res = await applyModeration({
          targetType,
          targetId,
          action,
          reason: reason.trim(),
        });
        if (res.status === 200) {
          setOpen(false);
          setReason("");
          router.refresh();
        } else {
          setErr(res.message ?? "Action failed.");
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  if (
    !can("moderation.hide") &&
    !can("moderation.remove") &&
    !can("moderation.restrict") &&
    !can("moderation.restore")
  ) {
    return null;
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Act
      </Button>
    );
  }

  return (
    <div className="min-w-[220px] space-y-1.5 rounded border border-border bg-card p-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        className="w-full rounded border border-border bg-background p-1 text-xs"
      />
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      <div className="flex flex-wrap gap-1">
        {isDown && can("moderation.restore") && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !reason.trim()}
            onClick={() => run("restore")}
          >
            Restore
          </Button>
        )}
        {!isDown && can("moderation.hide") && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !reason.trim()}
            onClick={() => run("hide")}
          >
            Hide
          </Button>
        )}
        {!isDown && can("moderation.restrict") && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !reason.trim()}
            onClick={() => run("restrict")}
          >
            Restrict
          </Button>
        )}
        {can("moderation.remove") && (
          <Button
            size="sm"
            variant="danger"
            disabled={pending || !reason.trim()}
            onClick={() => run("remove")}
          >
            Remove
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className={cn(pending && "opacity-50")}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
