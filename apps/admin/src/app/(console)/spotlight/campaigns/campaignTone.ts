import type { ContentCampaignStatus } from "@abonten/types/contentType";

export function campaignTone(
  status: ContentCampaignStatus,
): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "active":
    case "scheduled":
      return "success";
    case "pending_review":
    case "paused":
    case "pending_payment":
      return "warning";
    case "rejected":
      return "danger";
    case "refunded":
      return "info";
    default:
      return "neutral";
  }
}
