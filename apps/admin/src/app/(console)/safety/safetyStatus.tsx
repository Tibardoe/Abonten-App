import { Badge } from "@/components/ui";
import type { SafetyAdminSessionRow } from "@abonten/types/safetyType";

/** A session's state as one badge (words, not colour alone). */
export function safetyStatusBadge(
  r: Pick<SafetyAdminSessionRow, "status" | "resolution">,
) {
  if (r.status === "alerting") return <Badge tone="danger">Alert open</Badge>;
  if (r.status === "active") return <Badge tone="info">Running</Badge>;
  if (r.resolution === "false_alarm")
    return <Badge tone="warning">Mistake</Badge>;
  if (r.status === "expired") return <Badge tone="neutral">Ran out</Badge>;
  return (
    <Badge tone="success">{r.resolution === "ended" ? "Ended" : "Safe"}</Badge>
  );
}
