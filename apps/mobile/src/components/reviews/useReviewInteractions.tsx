import { useSession } from "@/auth/SessionProvider";
import { ReportSheet } from "@/components/ReportSheet";
import {
  type OwnReview,
  type ReviewSubject,
  useDeleteOwnReview,
} from "@/features/reviews/useReviewSubject";
import {
  useSetReviewHelpful,
  useSetUserBlock,
} from "@/features/reviews/useReviews";
import { setPendingRedirect } from "@/lib/authRedirect";
import { reviewShareUrl } from "@/lib/share";
import { useShareLink } from "@/lib/useShareLink";
import {
  type ReviewListRow,
  reviewerDisplayName,
} from "@abonten/core/reviews/reviewList";
import { useModalHandoff, useToast } from "@abonten/ui-native";
import { usePathname, useRouter } from "expo-router";
import { type ReactNode, useCallback, useState } from "react";
import { Alert } from "react-native";
import { type ReviewAction, ReviewActionsSheet } from "./ReviewActionsSheet";
import { ReviewComposerSheet } from "./ReviewComposerSheet";

// Everything you can do with a review, in one place, so the details preview
// and the full Reviews screen behave identically: Helpful (signed-out
// visitors are sent to sign in and brought back), the ⋯ menu, share, report,
// block, and writing / editing / deleting your own. Sheets hand off to each
// other only after the first has fully dismissed (useModalHandoff) — opening
// one while another is closing freezes iOS.

type MenuTarget =
  | { type: "own"; review: OwnReview }
  | { type: "other"; review: ReviewListRow };

export type ReviewInteractions = {
  cardProps: (review: ReviewListRow) => {
    onToggleHelpful?: (helpful: boolean) => void;
    onMore: () => void;
  };
  openOwnMenu: (review: OwnReview) => void;
  openComposer: (existing?: OwnReview | null) => void;
  sheets: ReactNode;
};

export function useReviewInteractions(
  subject: ReviewSubject | undefined,
): ReviewInteractions {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const share = useShareLink();
  const handoff = useModalHandoff();
  const helpful = useSetReviewHelpful(subject?.kind ?? "event");
  const block = useSetUserBlock();
  const deleteOwn = useDeleteOwnReview(subject);

  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [composer, setComposer] = useState<{
    open: boolean;
    existing: OwnReview | null;
  }>({ open: false, existing: null });
  const [report, setReport] = useState<{ id: string; label: string } | null>(
    null,
  );

  const viewerId = session?.user.id;

  const goSignIn = useCallback(() => {
    if (pathname) setPendingRedirect(pathname);
    router.push("/(auth)/sign-in");
  }, [pathname, router]);

  const shareReview = useCallback(
    (reviewId: string, rating: number) => {
      if (!subject) return;
      void share(
        `${rating}-star review of ${subject.title}`,
        reviewShareUrl(subject.kind, subject.slug, reviewId),
      );
    },
    [share, subject],
  );

  const confirmDelete = useCallback(
    (review: OwnReview) => {
      Alert.alert(
        "Delete your review?",
        "It will be removed from this page and its rating no longer counts. This can't be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () =>
              deleteOwn.mutate(review.id, {
                onSuccess: () => toast.success("Review deleted"),
                onError: (e) =>
                  toast.error("Couldn't delete your review", {
                    description:
                      e instanceof Error && e.message
                        ? e.message
                        : "Check your connection and try again.",
                  }),
              }),
          },
        ],
      );
    },
    [deleteOwn, toast],
  );

  const confirmBlock = useCallback(
    (review: ReviewListRow) => {
      if (!subject) return;
      const name = reviewerDisplayName(review.reviewer, subject.kind);
      Alert.alert(
        `Block ${name}?`,
        "You won't see their reviews, and neither of you can message the other. You can unblock them any time in Settings › Blocked accounts.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Block",
            style: "destructive",
            onPress: () =>
              block.mutate(
                { userId: review.reviewerId, block: true },
                {
                  onSuccess: () => toast.success(`${name} is blocked`),
                  onError: (e) =>
                    toast.error("Couldn't block", {
                      description:
                        e instanceof Error && e.message
                          ? e.message
                          : "Check your connection and try again.",
                    }),
                },
              ),
          },
        ],
      );
    },
    [block, subject, toast],
  );

  const onAction = (action: ReviewAction) => {
    const target = menu;
    if (!target) return;
    handoff.after(() => {
      if (target.type === "own") {
        if (action === "edit")
          setComposer({ open: true, existing: target.review });
        else if (action === "delete") confirmDelete(target.review);
        else if (action === "share")
          shareReview(target.review.id, target.review.rating);
        return;
      }
      const r = target.review;
      if (action === "share") shareReview(r.id, r.rating);
      else if (action === "report")
        setReport({
          id: r.id,
          label: `Review by ${subject ? reviewerDisplayName(r.reviewer, subject.kind) : "a reviewer"}`,
        });
      else if (action === "block") confirmBlock(r);
    });
    setMenu(null);
  };

  const actions: ReviewAction[] = !menu
    ? []
    : menu.type === "own"
      ? subject?.slug
        ? ["edit", "share", "delete"]
        : ["edit", "delete"]
      : [
          ...(subject?.slug ? (["share"] as const) : []),
          ...(viewerId ? (["report"] as const) : []),
          ...(viewerId && !menu.review.reviewer.deleted
            ? (["block"] as const)
            : []),
        ];

  const cardProps = useCallback(
    (review: ReviewListRow) => {
      const own = !!viewerId && review.reviewerId === viewerId;
      const isOwner = !!viewerId && subject?.ownerId === viewerId;
      return {
        onToggleHelpful:
          own || isOwner
            ? undefined
            : (next: boolean) => {
                if (!viewerId) {
                  goSignIn();
                  return;
                }
                helpful.mutate({ reviewId: review.id, helpful: next });
              },
        onMore: () => setMenu({ type: "other", review }),
      };
    },
    [goSignIn, helpful, subject?.ownerId, viewerId],
  );

  const blockName =
    menu?.type === "other" && subject
      ? reviewerDisplayName(menu.review.reviewer, subject.kind)
      : undefined;

  const sheets = subject ? (
    <>
      <ReviewActionsSheet
        open={menu !== null}
        onClose={() => {
          handoff.cancel();
          setMenu(null);
        }}
        onDismiss={handoff.onDismiss}
        actions={actions}
        blockLabel={blockName ? `Block ${blockName}` : undefined}
        onAction={onAction}
      />
      <ReviewComposerSheet
        open={composer.open}
        onClose={() => setComposer((c) => ({ ...c, open: false }))}
        kind={subject.kind}
        subjectId={subject.id}
        subjectTitle={subject.title}
        existingReview={composer.existing}
      />
      <ReportSheet
        open={report !== null}
        onClose={() => setReport(null)}
        targetType={subject.kind === "event" ? "event_review" : "place_review"}
        targetId={report?.id ?? subject.id}
        label={report?.label ?? subject.title}
      />
    </>
  ) : null;

  return {
    cardProps,
    openOwnMenu: (review) => setMenu({ type: "own", review }),
    openComposer: (existing) => {
      if (!viewerId) {
        goSignIn();
        return;
      }
      setComposer({ open: true, existing: existing ?? null });
    },
    sheets,
  };
}
