"use client";

import { reviewPlaceClaimRequest } from "@/actions/reviewPlaceClaimRequest";
import Notification from "@/components/atoms/Notification";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import InfiniteList from "@/components/organisms/InfiniteList";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import type { PaginatedResult } from "@/types/pagination";
import type { PlaceClaimRequest } from "@/types/placeType";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

const QUERY_KEY = ["admin-place-claim-requests", "pending"];

const emptyState = (
  <p className="text-muted-foreground text-sm">No pending claim requests.</p>
);

type AdminPlaceClaimsListProps = {
  initialPage: PaginatedResult<PlaceClaimRequest>;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<PlaceClaimRequest>>;
};

// Approve is a direct button (clearly positive-intent action); reject goes
// through ConfirmDeleteModal.tsx, reused as-is, since rejecting is a
// meaningful, slightly destructive action worth a confirmation step -- per
// the milestone's explicit guidance on which action needs which UX.
export default function AdminPlaceClaimsList({
  initialPage,
  fetchPage,
}: AdminPlaceClaimsListProps) {
  const queryClient = useQueryClient();
  const { message: notification, showMessage } = useTimedMessage(4000);
  const [pendingRejectId, setPendingRejectId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const handleApprove = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const response = await reviewPlaceClaimRequest({
        requestId,
        decision: "approve",
      });

      if (response.status === 200) {
        showMessage("✅ Claim approved.");
        refresh();
      } else {
        showMessage(`❌ ${response.message}`);
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!pendingRejectId) return;

    setProcessingId(pendingRejectId);
    try {
      const response = await reviewPlaceClaimRequest({
        requestId: pendingRejectId,
        decision: "reject",
      });

      if (response.status === 200) {
        showMessage("Claim rejected.");
        refresh();
      } else {
        showMessage(`❌ ${response.message}`);
      }
    } finally {
      setProcessingId(null);
      setPendingRejectId(null);
    }
  };

  return (
    <>
      <InfiniteList<PlaceClaimRequest>
        queryKey={QUERY_KEY}
        initialPage={initialPage}
        fetchPage={fetchPage}
        emptyState={emptyState}
        listClassName="flex flex-col gap-3"
        renderItem={(request) => (
          <li
            key={request.id}
            className="border border-border bg-card text-card-foreground rounded-lg p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/places/${request.place?.slug ?? ""}`}
                  className="font-medium hover:underline"
                >
                  {request.place?.name ?? "Unknown place"}
                </Link>
                <p className="text-sm text-muted-foreground">
                  Claimed by @{request.user_info?.username ?? "unknown"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(request.created_at).toLocaleDateString()}
              </span>
            </div>

            {request.note && (
              <p className="text-sm text-foreground whitespace-pre-line">
                {request.note}
              </p>
            )}

            {(request.contact_phone || request.contact_email) && (
              <p className="text-sm text-muted-foreground">
                {request.contact_phone}
                {request.contact_phone && request.contact_email ? " · " : ""}
                {request.contact_email}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={processingId === request.id}
                onClick={() => handleApprove(request.id)}
                className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={processingId === request.id}
                onClick={() => setPendingRejectId(request.id)}
                className="border border-border px-3 py-1.5 rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          </li>
        )}
      />

      {pendingRejectId && (
        <ConfirmDeleteModal
          message="Reject this claim request? The claimant will be notified."
          isLoading={processingId === pendingRejectId}
          onConfirm={handleConfirmReject}
          onCancel={() => setPendingRejectId(null)}
        />
      )}

      <Notification notification={notification} />
    </>
  );
}
