"use client";

import { Badge, Button, Td, timeAgo } from "@/components/ui";
import { setErrorGroupStatus } from "@/server/actions";
import type { ErrorGroup } from "@abonten/types/adminTypes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ErrorGroupRow({
  group,
  canManage,
}: {
  group: ErrorGroup;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  function set(status: "acknowledged" | "resolved" | "ignored") {
    start(async () => {
      const res = await setErrorGroupStatus({ fingerprint: group.fingerprint, status });
      if (res.status === 200) router.refresh();
    });
  }

  return (
    <>
      <tr className="hover:bg-muted/40">
        <Td>
          <button
            type="button"
            className="text-left font-medium hover:underline"
            onClick={() => setOpen((o) => !o)}
          >
            {group.title}
          </button>
          {group.lastRoute ? (
            <div className="text-xs text-muted-foreground">
              {group.lastRoute}
              {group.lastAppVersion ? ` · v${group.lastAppVersion}` : ""}
            </div>
          ) : null}
        </Td>
        <Td className="tabular-nums">{group.eventCount}</Td>
        <Td className="text-xs">{group.platforms.join(", ")}</Td>
        <Td className="whitespace-nowrap text-muted-foreground">{timeAgo(group.lastSeen)}</Td>
        <Td>
          <Badge
            tone={
              group.status === "open"
                ? "danger"
                : group.status === "resolved"
                  ? "success"
                  : "neutral"
            }
          >
            {group.status}
          </Badge>
        </Td>
        {canManage && (
          <Td>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("acknowledged")}>
                Ack
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("resolved")}>
                Resolve
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("ignored")}>
                Ignore
              </Button>
            </div>
          </Td>
        )}
      </tr>
      {open && (
        <tr>
          <td colSpan={canManage ? 6 : 5} className="border-b border-border bg-muted/30 px-3 py-2">
            <pre className="max-h-48 overflow-auto text-xs">
              {group.sampleMessage ?? "(no message)"}
            </pre>
            <p className="mt-1 text-xs text-muted-foreground">
              First seen {timeAgo(group.firstSeen)} · fingerprint {group.fingerprint}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
