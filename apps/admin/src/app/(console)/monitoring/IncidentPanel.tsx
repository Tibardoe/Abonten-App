"use client";

import { Badge, Button, cn } from "@/components/ui";
import { upsertIncident } from "@/server/actions";
import type { Incident } from "@abonten/types/adminTypes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const STATUSES = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
] as const;
const SEVERITIES = ["low", "medium", "high", "critical"] as const;

type FormState = {
  id?: string;
  title: string;
  status: (typeof STATUSES)[number];
  severity: (typeof SEVERITIES)[number];
  component: string;
  summary: string;
};

function IncidentForm({
  initial,
  onDone,
}: {
  initial?: Incident;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<FormState>({
    id: initial?.id,
    title: initial?.title ?? "",
    status: (initial?.status as FormState["status"]) ?? "investigating",
    severity: (initial?.severity as FormState["severity"]) ?? "medium",
    component: initial?.component ?? "",
    summary: initial?.summary ?? "",
  });

  function submit() {
    setErr(null);
    start(async () => {
      const res = await upsertIncident({
        id: f.id,
        title: f.title.trim(),
        status: f.status,
        severity: f.severity,
        component: f.component.trim() || null,
        summary: f.summary.trim() || null,
      });
      if (res.status === 200) {
        onDone();
        router.refresh();
      } else {
        setErr(res.message ?? "Save failed.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded border border-border bg-card p-3">
      <input
        value={f.title}
        onChange={(e) => setF({ ...f, title: e.target.value })}
        placeholder="Incident title"
        className="w-full rounded border border-border bg-background p-1.5 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={f.status}
          onChange={(e) =>
            setF({ ...f, status: e.target.value as FormState["status"] })
          }
          className="rounded border border-border bg-background p-1.5 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={f.severity}
          onChange={(e) =>
            setF({ ...f, severity: e.target.value as FormState["severity"] })
          }
          className="rounded border border-border bg-background p-1.5 text-sm"
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={f.component}
          onChange={(e) => setF({ ...f, component: e.target.value })}
          placeholder="Component (optional)"
          className="flex-1 rounded border border-border bg-background p-1.5 text-sm"
        />
      </div>
      <textarea
        value={f.summary}
        onChange={(e) => setF({ ...f, summary: e.target.value })}
        placeholder="Summary / running notes"
        rows={2}
        className="w-full rounded border border-border bg-background p-1.5 text-sm"
      />
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !f.title.trim()}
          onClick={submit}
        >
          {f.id ? "Save" : "Create incident"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function IncidentPanel({
  incidents,
  canManage,
}: {
  incidents: Incident[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {canManage && !creating && (
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          New incident
        </Button>
      )}
      {creating && <IncidentForm onDone={() => setCreating(false)} />}

      {incidents.length === 0 && !creating ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No incidents recorded.
        </p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {incidents.map((i) =>
            editing === i.id ? (
              <li key={i.id}>
                <IncidentForm initial={i} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li
                key={i.id}
                className="flex items-start justify-between gap-2 rounded border border-border p-2"
              >
                <div>
                  <span className="font-medium">{i.title}</span>{" "}
                  <Badge
                    tone={
                      i.status === "resolved"
                        ? "success"
                        : i.severity === "critical" || i.severity === "high"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {i.status}
                  </Badge>{" "}
                  <span className="text-xs text-muted-foreground">
                    {i.severity}
                    {i.component ? ` · ${i.component}` : ""} · started{" "}
                    {new Date(i.startedAt).toLocaleString()}
                  </span>
                  {i.summary ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {i.summary}
                    </p>
                  ) : null}
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setEditing(i.id)}
                    className={cn(
                      "shrink-0 text-xs text-primary hover:underline",
                    )}
                  >
                    Edit
                  </button>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
