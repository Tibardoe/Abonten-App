"use client";

import { Button, cn } from "@/components/ui";
import { addVerificationNote } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Internal notes are immutable (admin_note has no UPDATE/DELETE grant and a
// trigger to match), so this only ever adds a new one.

export function NoteForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add an internal note…"
        rows={2}
        className="w-full rounded border border-border bg-background p-1.5 text-sm"
      />
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
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !body.trim()}
        onClick={() => {
          setMsg(null);
          start(async () => {
            const res = await addVerificationNote({
              caseId,
              body: body.trim(),
            });
            if (res.status === 200) {
              setBody("");
              setMsg({ tone: "ok", text: "Note added." });
              router.refresh();
            } else {
              setMsg({
                tone: "err",
                text: res.message ?? "Could not save the note.",
              });
            }
          });
        }}
      >
        Add note
      </Button>
    </div>
  );
}
