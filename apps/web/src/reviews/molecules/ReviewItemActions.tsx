"use client";

import { ReportDialog } from "@/components/organisms/ReportDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/useToast";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import {
  type ReviewListRow,
  type ReviewSubjectKind,
  reviewerDisplayName,
  reviewsPath,
} from "@abonten/core/reviews/reviewList";
import { Ban, Flag, MoreHorizontal, Share2, ThumbsUp } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useBlockReviewer, useSetReviewHelpful } from "../useReviewQueries";

// Helpful + the ⋯ menu under one review. Signed out, Helpful sends you to
// sign in; your own review and reviews of your own listing have no Helpful
// (the database refuses both anyway). The menu offers Share for everyone,
// and Report / Block for signed-in visitors on someone else's review. Your
// own review's Edit / Delete live on the "Your review" controls at the top.

export default function ReviewItemActions({
  review,
  kind,
  subjectSlug,
  subjectTitle,
  viewerId,
  ownerId,
}: {
  review: ReviewListRow;
  kind: ReviewSubjectKind;
  /** Event code / place slug — for the share link. */
  subjectSlug: string;
  subjectTitle: string;
  viewerId: string | null;
  /** The organizer / place owner. */
  ownerId: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const helpful = useSetReviewHelpful(kind);
  const block = useBlockReviewer();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const isOwn = !!viewerId && viewerId === review.reviewerId;
  const isOwner = !!viewerId && viewerId === ownerId;
  const name = reviewerDisplayName(review.reviewer, kind);
  const canVote = !isOwn && !isOwner;

  const toggleHelpful = () => {
    if (!viewerId) {
      router.push(getSignInUrl(`${pathname}${window.location.search}`));
      return;
    }
    helpful.mutate({
      reviewId: review.id,
      helpful: !review.viewerFoundHelpful,
    });
  };

  const share = async () => {
    const url = `${window.location.origin}${reviewsPath(kind, subjectSlug, review.id)}`;
    const title = `${review.rating}-star review of ${subjectTitle}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (error) {
      // Closing the share sheet rejects with AbortError — not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn't share this review.");
    }
  };

  const helpfulLabel =
    review.helpfulCount === 1
      ? "1 person found this helpful"
      : `${review.helpfulCount.toLocaleString("en-US")} people found this helpful`;

  return (
    <div className="flex items-center gap-3">
      {canVote ? (
        <button
          type="button"
          onClick={toggleHelpful}
          aria-pressed={review.viewerFoundHelpful}
          aria-label={
            review.viewerFoundHelpful
              ? "Marked as helpful. Click to undo."
              : "Mark this review as helpful"
          }
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            review.viewerFoundHelpful
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          <ThumbsUp className="h-4 w-4" aria-hidden />
          Helpful
          {review.helpfulCount > 0
            ? ` · ${review.helpfulCount.toLocaleString("en-US")}`
            : ""}
        </button>
      ) : review.helpfulCount > 0 ? (
        <span className="text-xs text-muted-foreground">{helpfulLabel}</span>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Review options"
          className="ml-auto rounded-full p-1.5 text-muted-foreground hover:bg-accent"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void share()}>
            <Share2 className="mr-2 h-4 w-4" /> Share review
          </DropdownMenuItem>
          {viewerId && !isOwn ? (
            <DropdownMenuItem onSelect={() => setReportOpen(true)}>
              <Flag className="mr-2 h-4 w-4" /> Report review
            </DropdownMenuItem>
          ) : null}
          {viewerId && !isOwn && !review.reviewer.deleted ? (
            <DropdownMenuItem
              onSelect={() => setBlockOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <Ban className="mr-2 h-4 w-4" /> Block {name}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType={kind === "event" ? "event_review" : "place_review"}
        targetId={review.id}
        targetLabel={`review by ${name}`}
      />

      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You won&apos;t see their reviews, and neither of you can message
              the other. You can unblock them any time in Settings › Blocked
              accounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                block.mutate(review.reviewerId, {
                  onSuccess: () => toast.success(`${name} is blocked`),
                  onError: (e) =>
                    toast.error(
                      e instanceof Error ? e.message : "Couldn't block.",
                    ),
                })
              }
            >
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
