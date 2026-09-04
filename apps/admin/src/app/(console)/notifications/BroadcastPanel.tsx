"use client";

import { Button } from "@/components/ui";
import { broadcastNotification } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SegKind = "all_users" | "event_attendees" | "single_user";

export function BroadcastPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SegKind>("event_attendees");
  const [targetId, setTargetId] = useState("");
  const [type, setType] = useState("announcement");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function send() {
    setMsg(null);
    const segment =
      kind === "all_users"
        ? { kind: "all_users" as const }
        : kind === "event_attendees"
          ? { kind: "event_attendees" as const, eventId: targetId.trim() }
          : { kind: "single_user" as const, userId: targetId.trim() };

    start(async () => {
      const res = await broadcastNotification({
        segment,
        type: type.trim(),
        title: title.trim(),
        body: body.trim() || undefined,
        link: link.trim() || undefined,
      });
      setMsg(res.message ?? (res.status === 200 ? "Sent." : "Failed."));
      if (res.status === 200) {
        setTitle("");
        setBody("");
        setLink("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Broadcast a notification
      </Button>
    );
  }

  const needsTarget = kind !== "all_users";
  const disabled =
    pending ||
    !title.trim() ||
    !type.trim() ||
    (needsTarget && !targetId.trim());

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Broadcast a notification</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <p className="rounded border border-warning/40 bg-warning/10 p-1.5 text-xs">
        In-app only — broadcasts do not send mobile pushes. This needs a fresh
        step-up (Admin Settings › Confirm identity). Every send is audited with
        the recipient count.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SegKind)}
          className="h-8 rounded border border-border bg-background px-2 text-sm"
        >
          <option value="event_attendees">Event attendees</option>
          <option value="single_user">Single user</option>
          <option value="all_users">All users</option>
        </select>
        {needsTarget && (
          <input
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder={
              kind === "event_attendees" ? "event id (uuid)" : "user id (uuid)"
            }
            className="h-8 w-64 rounded border border-border bg-background px-2 text-sm"
          />
        )}
        <input
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="type"
          className="h-8 w-40 rounded border border-border bg-background px-2 text-sm"
        />
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (required)"
        maxLength={160}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Body (optional)"
        rows={2}
        maxLength={1000}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="Link (optional, e.g. /events/ABC123)"
        maxLength={400}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
      />

      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}

      <Button size="sm" disabled={disabled} onClick={send}>
        {pending ? "Sending…" : "Send broadcast"}
      </Button>
    </div>
  );
}
