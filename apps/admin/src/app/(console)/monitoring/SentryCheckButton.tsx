"use client";

import { useState } from "react";

type Result = {
  ok: boolean;
  eventId?: string;
  enabled?: boolean;
  environment?: string | null;
  note?: string;
  error?: string;
};

// Fires GET /monitoring/sentry-check, which sends one deliberate event to
// the abonten-admin Sentry project and hands back its id. Lets an operator
// confirm the pipeline end-to-end without waiting for a real error.
export function SentryCheckButton() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/monitoring/sentry-check", { cache: "no-store" });
      setRes((await r.json()) as Result);
    } catch {
      setRes({ ok: false, error: "request failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send test event to Sentry"}
      </button>
      {res && (
        <span className="text-muted-foreground">
          {res.ok
            ? res.enabled
              ? `Sent — event ${res.eventId} (env: ${res.environment}). Find it in the abonten-admin project.`
              : (res.note ?? "Sentry disabled in this build — nothing sent.")
            : `Failed: ${res.error ?? "unknown"}`}
        </span>
      )}
    </div>
  );
}
