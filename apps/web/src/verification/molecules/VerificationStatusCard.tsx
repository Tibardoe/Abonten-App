import { ownerStatusCopy } from "@abonten/core/verification/copy";
import type {
  VerificationStatus,
  VerificationSubjectType,
} from "@abonten/types/verificationType";
import {
  IoAlertCircle,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoTimeOutline,
} from "react-icons/io5";

// The one card that tells an owner where their request stands. Every state
// gets its own icon and tone so the meaning is not carried by colour alone,
// matching VerifiedBadge.tsx's reasoning.

const ICON: Record<VerificationStatus, typeof IoCheckmarkCircle> = {
  draft: IoTimeOutline,
  pending_review: IoTimeOutline,
  needs_info: IoAlertCircle,
  approved: IoCheckmarkCircle,
  rejected: IoCloseCircle,
  withdrawn: IoTimeOutline,
  revoked: IoAlertCircle,
};

const TONE: Record<VerificationStatus, string> = {
  draft: "border-border bg-muted",
  pending_review: "border-border bg-muted",
  needs_info: "border-amber-500/40 bg-amber-500/10",
  approved: "border-mint/40 bg-mint/10",
  rejected: "border-destructive/30 bg-destructive/10",
  withdrawn: "border-border bg-muted",
  revoked: "border-amber-500/40 bg-amber-500/10",
};

const ICON_TONE: Record<VerificationStatus, string> = {
  draft: "text-muted-foreground",
  pending_review: "text-muted-foreground",
  needs_info: "text-amber-600",
  approved: "text-mint",
  rejected: "text-destructive",
  withdrawn: "text-muted-foreground",
  revoked: "text-amber-600",
};

export default function VerificationStatusCard({
  status,
  subjectType,
  subjectName,
  reason,
  submittedAt,
  verifiedAt,
}: {
  status: VerificationStatus;
  subjectType: VerificationSubjectType;
  subjectName?: string | null;
  reason?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
}) {
  const copy = ownerStatusCopy(status, subjectType, { subjectName, reason });
  const Icon = ICON[status];
  const stamp = status === "approved" ? verifiedAt : submittedAt;

  return (
    <div className={`rounded-xl border p-4 ${TONE[status]}`}>
      <div className="flex items-start gap-3">
        <Icon aria-hidden className={`mt-0.5 text-xl ${ICON_TONE[status]}`} />
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold">{copy.title}</h3>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
          {stamp ? (
            <p className="text-xs text-muted-foreground">
              {status === "approved" ? "Verified on " : "Sent on "}
              {new Date(stamp).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
