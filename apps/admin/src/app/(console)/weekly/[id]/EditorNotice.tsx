"use client";

import { cn } from "@/components/ui";
import { useEditor } from "./EditorContext";

export function EditorNotice() {
  const { notice, clearNotice } = useEditor();
  if (!notice) return <div aria-live="polite" className="sr-only" />;
  return (
    <div
      role={notice.ok ? "status" : "alert"}
      aria-live="polite"
      className={cn(
        "mb-4 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm",
        notice.ok
          ? "border-success/40 bg-success/10"
          : "border-destructive/40 bg-destructive/10",
      )}
    >
      <span>{notice.text}</span>
      <button
        type="button"
        onClick={clearNotice}
        className="text-xs text-muted-foreground hover:underline"
      >
        Dismiss
      </button>
    </div>
  );
}
