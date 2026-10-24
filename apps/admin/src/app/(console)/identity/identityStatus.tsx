import { Badge } from "@/components/ui";
import type { IdentityStaffSummary } from "@abonten/services/admin/identity/identityAdminCore";
import type {
  IdentityResultStatus,
  IdentityVerificationStatus,
} from "@abonten/types/identityType";
import Link from "next/link";

/** An attempt's state as one badge (words, not colour alone). */
export function identityStatusBadge(status: IdentityVerificationStatus) {
  switch (status) {
    case "approved":
      return <Badge tone="success">Verified</Badge>;
    case "needs_review":
      return <Badge tone="warning">Needs review</Badge>;
    case "rejected":
      return <Badge tone="danger">Rejected</Badge>;
    case "revoked":
      return <Badge tone="danger">Revoked</Badge>;
    case "failed":
      return <Badge tone="neutral">Failed</Badge>;
    case "created":
      return <Badge tone="info">Started</Badge>;
    case "submitted":
      return <Badge tone="info">Submitted</Badge>;
    case "processing":
      return <Badge tone="info">Checking</Badge>;
    case "expired":
      return <Badge tone="neutral">Expired</Badge>;
    case "cancelled":
      return <Badge tone="neutral">Cancelled</Badge>;
  }
}

export const PROVIDER_VERDICT: Record<IdentityResultStatus, string> = {
  clear: "Clear",
  attention: "Attention",
  block: "Blocked",
  error: "Error",
};

const DOCUMENTS: Record<string, string> = {
  GHANA_CARD: "Ghana Card",
  PASSPORT: "Passport",
  DRIVERS_LICENSE: "Driver's licence",
  VOTER_ID: "Voter ID",
  NATIONAL_ID: "National ID",
};

export function documentLabel(country: string, type: string): string {
  return `${DOCUMENTS[type] ?? type} (${country})`;
}

/** "ID checked" / where the last attempt stands, linked to the check. */
export function IdentitySummaryLink({
  summary,
}: {
  summary: IdentityStaffSummary | undefined;
}) {
  if (!summary?.verificationId) {
    return <Badge tone="neutral">ID not checked</Badge>;
  }
  return (
    <Link href={`/identity/${summary.verificationId}`}>
      {summary.verified ? (
        <Badge tone="success">ID checked</Badge>
      ) : summary.status ? (
        identityStatusBadge(summary.status)
      ) : (
        <Badge tone="neutral">ID not checked</Badge>
      )}
    </Link>
  );
}
