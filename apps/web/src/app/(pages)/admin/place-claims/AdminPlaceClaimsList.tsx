"use client";

import {
  type PlaceClaimDocument,
  getPlaceClaimDocuments,
} from "@/actions/getPlaceClaimDocuments";
import { reviewPlaceClaimRequest } from "@/actions/reviewPlaceClaimRequest";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import InfiniteList from "@/components/organisms/InfiniteList";
import { useToast } from "@/hooks/useToast";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { PlaceClaimRequest } from "@abonten/types/placeType";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

// Lazy-loaded, admin-only viewer for a claim's private supporting documents
// (§12). Signed URLs are short-lived (5 min) and fetched only on expand.
function ClaimDocuments({
  requestId,
  count,
}: {
  requestId: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<PlaceClaimDocument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && docs === null && !loading) {
      setLoading(true);
      setError(null);
      const res = await getPlaceClaimDocuments(requestId);
      setLoading(false);
      if (res.status === 200) setDocs(res.data);
      else setError(res.message ?? "Couldn't load documents.");
    }
  }

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={toggle}
        className="text-sm text-primary hover:underline"
      >
        {open ? "Hide" : "View"} {count} document{count === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {docs?.map((doc) => (
            <a
              key={doc.id}
              href={doc.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            >
              <span className="truncate">
                {doc.fileName ?? doc.mimeType ?? "Document"}
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                open ↗
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const toast = useToast();
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
        toast.success("Claim approved.");
        refresh();
      } else {
        toast.error(response.message ?? "We couldn't approve that claim.");
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
        toast.success("Claim rejected.");
        refresh();
      } else {
        toast.error(response.message ?? "We couldn't reject that claim.");
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

            <ClaimDocuments
              requestId={request.id}
              count={request.document_count ?? 0}
            />

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
          title="Reject this claim?"
          message="Reject this claim request? The claimant will be notified."
          confirmLabel="Reject Claim"
          isLoading={processingId === pendingRejectId}
          onConfirm={handleConfirmReject}
          onCancel={() => setPendingRejectId(null)}
        />
      )}
    </>
  );
}
