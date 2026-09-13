import { WEEKLY_EDITION_STATUS_LABEL } from "@abonten/core/weekly/copy";
import type { WeeklyEditionStatus } from "@abonten/types/weeklyType";

// Same text on the server render and in the browser (a locale-dependent
// toLocaleString() breaks hydration), in the timezone operations works in.
export function formatAccraDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
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
