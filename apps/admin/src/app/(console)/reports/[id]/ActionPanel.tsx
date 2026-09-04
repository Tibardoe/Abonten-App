"use client";

import { Button, Card, cn } from "@/components/ui";
import {
  addAdminNote,
  applyModeration,
  assignReport,
  requestReportInfo,
  resolveReport,
  updateReportStatus,
} from "@/server/actions";
import type {
  AdminPermissionKey,
  ModeratableTargetType,
  ReportStatus,
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

type Res = { status: number; message?: string };

export function ActionPanel({
  reportId,
  status,
  updatedAt,
  targetType,
  targetId,
  assignedTo,
  selfId,
  permissions,
}: {
  reportId: string;
  status: ReportStatus;
  updatedAt: string;
  targetType: ReportTargetType;
  targetId: string;
  assignedTo: string | null;
  selfId: string;
  permissions: AdminPermissionKey[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const can = (p: AdminPermissionKey) => permissions.includes(p);
  const terminal = ["resolved", "dismissed", "false_report"].includes(status);

  function run(fn: () => Promise<Res>) {
    setMsg(null);
    start(async () => {
      try {
        const res = await fn();
        if (res.status === 200) {
          setMsg({ tone: "ok", text: res.message ?? "Done." });
          router.refresh();
        } else {
          setMsg({ tone: "err", text: res.message ?? "Action failed." });
          if (res.status === 409) router.refresh();
        }
      } catch (e) {
        setMsg({
          tone: "err",
          text: e instanceof Error ? e.message : "Action failed.",
        });
      }
    });
  }

  return (
    <Card className="sticky top-2 space-y-4 p-4">
      <h3 className="text-sm font-semibold">Actions</h3>

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

      {!terminal && (
        <div className="space-y-3">
          {can("reports.assign") && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              className="w-full"
              onClick={() =>
                run(() =>
                  assignReport({
                    reportId,
                    assigneeId: assignedTo === selfId ? null : selfId,
                    expectedUpdatedAt: updatedAt,
                  }),
                )
              }
            >
              {assignedTo === selfId ? "Unassign me" : "Assign to me"}
            </Button>
          )}

          {can("reports.update_status") && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              className="w-full"
              onClick={() =>
                run(() =>
                  updateReportStatus({
                    reportId,
                    status: "under_review",
                    expectedUpdatedAt: updatedAt,
                  }),
                )
              }
            >
              Mark under review
            </Button>
          )}

          {can("reports.escalate") && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              className="w-full"
              onClick={() =>
                run(() =>
                  updateReportStatus({
                    reportId,
                    status: "escalated",
                    expectedUpdatedAt: updatedAt,
                  }),
                )
              }
            >
              Escalate
            </Button>
          )}

          {can("reports.request_info") && (
            <div className="space-y-1">
              <textarea
                value={infoMsg}
                onChange={(e) => setInfoMsg(e.target.value)}
                placeholder="Ask the reporter for more info…"
                rows={2}
                className="w-full rounded border border-border bg-background p-1.5 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={pending || !infoMsg.trim()}
                className="w-full"
                onClick={() =>
                  run(() =>
                    requestReportInfo({
                      reportId,
                      message: infoMsg.trim(),
                      expectedUpdatedAt: updatedAt,
                    }),
                  )
                }
              >
                Request information
              </Button>
            </div>
          )}
        </div>
      )}

      {can("reports.note") && (
        <div className="space-y-1 border-t border-border pt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Internal note (not visible to users)…"
            rows={2}
            className="w-full rounded border border-border bg-background p-1.5 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !note.trim()}
            className="w-full"
            onClick={() =>
              run(async () => {
                const res = await addAdminNote({
                  targetType: "report",
                  targetId: reportId,
                  body: note.trim(),
                });
                if (res.status === 200) setNote("");
                return res;
              })
            }
          >
            Add note
          </Button>
        </div>
      )}

      {MODERATABLE.includes(targetType) &&
        (can("moderation.hide") ||
          can("moderation.remove") ||
          can("moderation.restrict")) && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Content action
            </p>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required)"
              className="w-full rounded border border-border bg-background p-1.5 text-sm"
            />
            <div className="grid grid-cols-2 gap-1.5">
              {can("moderation.hide") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !reason.trim()}
                  onClick={() =>
                    run(() =>
                      applyModeration({
                        targetType: targetType as ModeratableTargetType,
                        targetId,
                        action: "hide",
                        reason: reason.trim(),
                        reportId,
                      }),
                    )
                  }
                >
                  Hide
                </Button>
              )}
              {can("moderation.restrict") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !reason.trim()}
                  onClick={() =>
                    run(() =>
                      applyModeration({
                        targetType: targetType as ModeratableTargetType,
                        targetId,
                        action: "restrict",
                        reason: reason.trim(),
                        reportId,
                      }),
                    )
                  }
                >
                  Restrict
                </Button>
              )}
              {can("moderation.remove") && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending || !reason.trim()}
                  onClick={() =>
                    run(() =>
                      applyModeration({
                        targetType: targetType as ModeratableTargetType,
                        targetId,
                        action: "remove",
                        reason: reason.trim(),
                        reportId,
                      }),
                    )
                  }
                >
                  Remove
                </Button>
              )}
              {can("moderation.restore") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !reason.trim()}
                  onClick={() =>
                    run(() =>
                      applyModeration({
                        targetType: targetType as ModeratableTargetType,
                        targetId,
                        action: "restore",
                        reason: reason.trim(),
                        reportId,
                      }),
                    )
                  }
                >
                  Restore
                </Button>
              )}
            </div>
          </div>
        )}

      {targetType === "user" || targetType === "organizer" ? (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          To act on this account, open{" "}
          <a
            href={`/users/${targetId}`}
            className="text-primary hover:underline"
          >
            the user record
          </a>
          .
        </p>
      ) : null}

      {!terminal && (can("reports.resolve") || can("reports.mark_false")) && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Close report
          </p>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Resolution note (required)…"
            rows={2}
            className="w-full rounded border border-border bg-background p-1.5 text-sm"
          />
          <div className="grid grid-cols-3 gap-1.5">
            {can("reports.resolve") && (
              <Button
                size="sm"
                disabled={pending || !resolution.trim()}
                onClick={() =>
                  run(() =>
                    resolveReport({
                      reportId,
                      status: "resolved",
                      resolution: resolution.trim(),
                      expectedUpdatedAt: updatedAt,
                    }),
                  )
                }
              >
                Resolve
              </Button>
            )}
            {can("reports.resolve") && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !resolution.trim()}
                onClick={() =>
                  run(() =>
                    resolveReport({
                      reportId,
                      status: "dismissed",
                      resolution: resolution.trim(),
                      expectedUpdatedAt: updatedAt,
                    }),
                  )
                }
              >
                Dismiss
              </Button>
            )}
            {can("reports.mark_false") && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !resolution.trim()}
                onClick={() =>
                  run(() =>
                    resolveReport({
                      reportId,
                      status: "false_report",
                      resolution: resolution.trim(),
                      expectedUpdatedAt: updatedAt,
                    }),
                  )
                }
              >
                False report
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
