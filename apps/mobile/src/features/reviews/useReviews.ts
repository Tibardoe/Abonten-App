import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import {
  patchReviewInData,
  removeReviewsInData,
  withHelpfulVote,
} from "@abonten/core/reviews/reviewCache";
import {
  REVIEW_PAGE_SIZE,
  REVIEW_PREVIEW_SIZE,
  type ReviewCursor,
  type ReviewListRow,
  type ReviewListRpcRow,
  type ReviewPage,
  type ReviewRatingFilter,
  type ReviewSort,
  type ReviewSubjectKind,
  type ReviewSummaryRpcRow,
  parseReviewRow,
  parseReviewSummary,
  reviewByIdArgs,
  reviewListArgs,
  toReviewPage,
} from "@abonten/core/reviews/reviewList";
import { hapticSelection, useToast } from "@abonten/ui-native";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { invalidateReviewSubject, reviewKeys } from "./reviewQueryKeys";

// The public side of event and place reviews: the rating breakdown, the
// short preview on a details screen, the full filterable list, one shared
// review, and "Helpful". All of it runs straight against Supabase — class-A
// in docs/architecture/shared-backend.md: review_list / review_summary are
// SECURITY INVOKER reads, review_set_helpful is auth.uid()-scoped and does
// every check itself (migration 20260923090000). Web reaches the same
// functions through @abonten/services/reviews, and both platforms shape the
// rows with @abonten/core/reviews/reviewList.

async function fetchPage(
  kind: ReviewSubjectKind,
  subjectId: string,
  opts: {
    rating?: ReviewRatingFilter;
    sort?: ReviewSort;
    cursor?: ReviewCursor | null;
    limit?: number;
    excludeViewer?: boolean;
  },
): Promise<ReviewPage> {
  const limit = opts.limit ?? REVIEW_PAGE_SIZE;
  const { data, error } = await supabase.rpc(
    "review_list",
    reviewListArgs({ kind, subjectId, ...opts, limit }) as never,
  );
  if (error) throw error;
  return toReviewPage(data as unknown as ReviewListRpcRow[], limit);
}

export function useReviewSummary(
  kind: ReviewSubjectKind,
  subjectId: string | undefined,
) {
  return useQuery({
    queryKey: reviewKeys.summary(kind, subjectId),
    enabled: !!subjectId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("review_summary", {
          p_subject_kind: kind,
          p_subject_id: subjectId as string,
        })
        .maybeSingle();
      if (error) throw error;
      return parseReviewSummary(data as ReviewSummaryRpcRow | null);
    },
  });
}

/**
 * The few reviews a details screen shows before "See all": the most helpful
 * first (newest first until anyone has voted), without the viewer's own —
 * that one has its own block with Edit / Delete.
 */
export function useReviewPreview(
  kind: ReviewSubjectKind,
  subjectId: string | undefined,
) {
  const { session } = useSession();
  return useQuery({
    queryKey: reviewKeys.preview(kind, subjectId, session?.user.id),
    enabled: !!subjectId,
    staleTime: 60_000,
    queryFn: async () =>
      (
        await fetchPage(kind, subjectId as string, {
          sort: "helpful",
          limit: REVIEW_PREVIEW_SIZE,
          excludeViewer: true,
        })
      ).reviews,
  });
}

export function useReviewList(
  kind: ReviewSubjectKind,
  subjectId: string | undefined,
  filter: { rating: ReviewRatingFilter; sort: ReviewSort },
) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: reviewKeys.list(kind, subjectId, session?.user.id, filter),
    enabled: !!subjectId,
    staleTime: 30_000,
    initialPageParam: null as ReviewCursor | null,
    getNextPageParam: (last: ReviewPage) => last.nextCursor,
    queryFn: ({ pageParam }) =>
      fetchPage(kind, subjectId as string, {
        rating: filter.rating,
        sort: filter.sort,
        cursor: pageParam,
        excludeViewer: true,
      }),
  });
}

/** The review a shared link points at. Null when it's gone, hidden or by someone you blocked. */
export function useSharedReview(
  kind: ReviewSubjectKind,
  subjectId: string | undefined,
  reviewId: string | null,
) {
  const { session } = useSession();
  return useQuery({
    queryKey: reviewKeys.shared(kind, subjectId, reviewId, session?.user.id),
    enabled: !!subjectId && !!reviewId,
    queryFn: async (): Promise<ReviewListRow | null> => {
      const { data, error } = await supabase.rpc(
        "review_list",
        reviewByIdArgs(kind, subjectId as string, reviewId as string) as never,
      );
      if (error) throw error;
      const row = (data as unknown as ReviewListRpcRow[] | null)?.[0];
      return row ? parseReviewRow(row) : null;
    },
  });
}

/**
 * "Helpful" / undo. Shown at once in every list that has the review, then
 * replaced by the database's own count; a refusal rolls the change back and
 * says why. The database allows one vote per person, so a double tap or a
 * retry can never count twice.
 */
export function useSetReviewHelpful(kind: ReviewSubjectKind) {
  const qc = useQueryClient();
  const toast = useToast();
  const prefix = ["mobile", "reviews", kind] as const;

  return useMutation({
    mutationFn: async (input: { reviewId: string; helpful: boolean }) => {
      const { data, error } = await supabase
        .rpc("review_set_helpful", {
          p_review_kind: kind,
          p_review_id: input.reviewId,
          p_helpful: input.helpful,
        })
        .maybeSingle();
      if (error) throw error;
      const row = data as {
        helpful_count: number;
        viewer_found_helpful: boolean;
      } | null;
      return {
        helpfulCount: Number(row?.helpful_count ?? 0),
        viewerFoundHelpful: !!row?.viewer_found_helpful,
      };
    },
    onMutate: async (input) => {
      hapticSelection();
      await qc.cancelQueries({ queryKey: prefix });
      const snapshot = qc.getQueriesData({ queryKey: prefix });
      qc.setQueriesData({ queryKey: prefix }, (old: unknown) =>
        patchReviewInData(old, input.reviewId, (r) =>
          withHelpfulVote(r, input.helpful),
        ),
      );
      return { snapshot };
    },
    onSuccess: (server, input) => {
      qc.setQueriesData({ queryKey: prefix }, (old: unknown) =>
        patchReviewInData(old, input.reviewId, (r) => ({
          ...r,
          helpfulCount: server.helpfulCount,
          viewerFoundHelpful: server.viewerFoundHelpful,
        })),
      );
    },
    onError: (error, _input, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        qc.setQueryData(key, data);
      }
      toast.error("Couldn't save that", {
        description:
          error instanceof Error && error.message
            ? error.message
            : "Check your connection and try again.",
      });
    },
  });
}

/**
 * Blocks (or unblocks) a person everywhere on Abonten — messages,
 * Spotlight, follows and reviews (user_block_set). Their reviews leave every
 * cached list at once; the lists then refetch without them.
 */
export function useSetUserBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; block: boolean }) => {
      const { error } = await supabase.rpc("user_block_set", {
        p_blocked_id: input.userId,
        p_block: input.block,
      });
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      if (input.block) {
        qc.setQueriesData({ queryKey: reviewKeys.all }, (old: unknown) =>
          removeReviewsInData(old, (r) => r.reviewerId === input.userId),
        );
      }
      qc.invalidateQueries({ queryKey: reviewKeys.all });
      qc.invalidateQueries({ queryKey: ["mobile", "blocked-accounts"] });
      qc.invalidateQueries({ queryKey: ["mobile", "content"] });
      qc.invalidateQueries({ queryKey: ["mobile", "messaging"] });
    },
  });
}

export { invalidateReviewSubject };
