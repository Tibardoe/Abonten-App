"use client";

import { Button, cn } from "@/components/ui";
import { resolveReportGroup } from "@/server/actions";
import type {
  AdminPermissionKey,
  ReportTargetType,
} from "@abonten/types/adminTypes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const MODERATABLE: ReportTargetType[] = [
  "event",
  "place",
  "event_review",
  "place_review",
  "user_review",
  "highlight",
];

export function GroupResolve({
  dedupeKey,
  targetType,
  openCount,
  permissions,
}: {
  dedupeKey: string;
  targetType: ReportTargetType;
  openCount: number;
  permissions: AdminPermissionKey[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [mod, setMod] = useState<"" | "hide" | "remove" | "restrict">("");
  const [msg, setMsg] = useState<string | null>(null);

  const canResolve = permissions.includes("reports.resolve");
  const canModerate =
    MODERATABLE.includes(targetType) &&
    ((mod === "hide" && permissions.includes("moderation.hide")) ||
      (mod === "remove" && permissions.includes("moderation.remove")) ||
      (mod === "restrict" && permissions.includes("moderation.restrict")) ||
      mod === "");

  if (!canResolve || openCount === 0) return null;

  function run(status: "resolved" | "dismissed") {
    setMsg(null);
    start(async () => {
      const res = await resolveReportGroup({
        dedupeKey,
        status,
        resolution: resolution.trim(),
        moderation:
          mod && MODERATABLE.includes(targetType)
            ? { action: mod, reason: resolution.trim() }
            : undefined,
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Resolve all {openCount}
      </Button>
    );
  }

  return (
    <div className="min-w-[260px] space-y-1.5 rounded border border-border bg-card p-2">
      <textarea
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        placeholder="Resolution note (required, applies to all)"
        rows={2}
        className="w-full rounded border border-border bg-background p-1 text-xs"
      />
      {MODERATABLE.includes(targetType) && (
        <select
          value={mod}
          onChange={(e) =>
            setMod(e.target.value as "" | "hide" | "remove" | "restrict")
          }
          className="w-full rounded border border-border bg-background p-1 text-xs"
        >
          <option value="">No content action</option>
          <option value="restrict">…and restrict the content</option>
          <option value="hide">…and hide the content</option>
          <option value="remove">…and remove the content</option>
        </select>
      )}
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          disabled={pending || !resolution.trim() || !canModerate}
          onClick={() => run("resolved")}
        >
          Resolve {openCount}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !resolution.trim()}
          onClick={() => run("dismissed")}
        >
          Dismiss {openCount}
        </Button>
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
