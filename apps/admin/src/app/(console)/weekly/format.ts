import { OPS_TIME_ZONE } from "@/lib/format";
import { WEEKLY_EDITION_STATUS_LABEL } from "@abonten/core/weekly/copy";
import type { WeeklyEditionStatus } from "@abonten/types/weeklyType";

// Same text on the server render and in the browser (a locale-dependent
// toLocaleString() breaks hydration). `timeZone` is the area's own clock
// where the time belongs to it (an edition's schedule); the console's
// operations clock otherwise.
export function formatOpsDateTime(
  iso: string | null | undefined,
  timeZone: string = OPS_TIME_ZONE,
): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function editionStatusTone(
  status: WeeklyEditionStatus,
): "neutral" | "info" | "success" | "warning" {
  switch (status) {
    case "published":
      return "success";
    case "scheduled":
      return "info";
    case "archived":
      return "neutral";
    default:
      return "warning";
  }
}

export const editionStatusLabel = (status: WeeklyEditionStatus) =>
  WEEKLY_EDITION_STATUS_LABEL[status];
