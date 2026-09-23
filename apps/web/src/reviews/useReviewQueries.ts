"use client";

import { getReviewPage } from "@/actions/getReviewPage";
import { getReviewSummary } from "@/actions/getReviewSummary";
import { getSharedReview } from "@/actions/getSharedReview";
import { setReviewHelpful } from "@/actions/setReviewHelpful";
import { setUserBlock } from "@/actions/setUserBlock";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
import {
  patchReviewInData,
  removeReviewsInData,
  withHelpfulVote,
} from "@abonten/core/reviews/reviewCache";
import {
  REVIEW_PREVIEW_SIZE,
  type ReviewCursor,
  type ReviewListRow,
  type ReviewPage,
  type ReviewRatingFilter,
  type ReviewSort,
  type ReviewSubjectKind,
  type ReviewSummary,
} from "@abonten/core/reviews/reviewList";
import {
  type QueryClient,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

// Web's review queries. Everything for one event or place sits under
// ["reviews", kind, subjectId, ...] so a new / edited / deleted review, an
// organizer reply or a block refreshes the preview, the breakdown and every
// filtered list together. The detail and reviews pages are statically
// rendered for everyone, so their first data is the public view; the
// visitor's own view (their helpful votes, people they blocked) replaces it
// in place once their session is known — keepPreviousData avoids a flash.

export const reviewKeys = {
  subject: (kind: ReviewSubjectKind, subjectId: string) =>
    ["reviews", kind, subjectId] as const,
};

export function invalidateReviewSubject(
  queryClient: QueryClient,
  kind: ReviewSubjectKind,
  subjectId?: string,
) {
  queryClient.invalidateQueries({
    queryKey: subjectId ? ["reviews", kind, subjectId] : ["reviews", kind],
  });
}

async function unwrap<T>(
  promise: Promise<{ status: number; message?: string; data?: T }>,
): Promise<T> {
  const res = await promise;
  if (res.status !== 200 || res.data === undefined) {
    throw new Error(res.message ?? "Couldn't load reviews.");
  }
  return res.data;
}

const PUBLIC = "public";

/**
 * Whose view of the reviews to show. "public" until the session is known —
 * the view the server rendered the page with, so hydration matches — then
 * the visitor's id, whose own view (their votes, their blocks) replaces the
 * public one in place (keepPreviousData, no flash).
 */
function useViewerKey(): string {
  const { data: user } = useCurrentUser();
  return user?.id ?? PUBLIC;
}

export function useReviewSummary(
  kind: ReviewSubjectKind,
  subjectId: string,
  initial?: ReviewSummary,
) {
  return useQuery({
    queryKey: [...reviewKeys.subject(kind, subjectId), "summary"],
    queryFn: () => unwrap(getReviewSummary(kind, subjectId)),
    initialData: initial,
    staleTime: 30_000,
  });
}

export function useReviewPreview(
  kind: ReviewSubjectKind,
  subjectId: string,
  initial?: ReviewListRow[],
) {
  const viewer = useViewerKey();
  return useQuery({
    queryKey: [...reviewKeys.subject(kind, subjectId), "preview", viewer],
    queryFn: async () =>
      (
        await unwrap(
          getReviewPage({
            kind,
            subjectId,
            sort: "helpful",
            limit: REVIEW_PREVIEW_SIZE,
          }),
        )
      ).reviews,
    // The server's public page is exactly the signed-out view.
    initialData: viewer === PUBLIC ? initial : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useReviewList(
  kind: ReviewSubjectKind,
  subjectId: string,
  filter: { rating: ReviewRatingFilter; sort: ReviewSort },
  initial?: ReviewPage,
) {
  const viewer = useViewerKey();
  const isDefault = filter.rating === null && filter.sort === "helpful";
  return useInfiniteQuery({
    queryKey: [
      ...reviewKeys.subject(kind, subjectId),
      "list",
      viewer,
      filter.rating,
      filter.sort,
    ],
    initialPageParam: null as ReviewCursor | null,
    getNextPageParam: (last: ReviewPage) => last.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        getReviewPage({
          kind,
          subjectId,
          rating: filter.rating,
          sort: filter.sort,
          cursor: pageParam,
        }),
      ),
    initialData:
      initial && isDefault && viewer === PUBLIC
        ? { pages: [initial], pageParams: [null] }
        : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useSharedReview(
  kind: ReviewSubjectKind,
  subjectId: string,
  reviewId: string | null,
  initial?: ReviewListRow | null,
) {
  const viewer = useViewerKey();
  return useQuery({
    queryKey: [
      ...reviewKeys.subject(kind, subjectId),
      "shared",
      reviewId,
      viewer,
    ],
    queryFn: () => getSharedReview(kind, subjectId, reviewId as string),
    initialData: viewer === PUBLIC ? initial : undefined,
    placeholderData: keepPreviousData,
    enabled: !!reviewId,
    staleTime: 30_000,
  });
}

/**
 * Helpful / undo — shown at once in every list that has the review, then
 * replaced by the database's count. One vote per person is enforced by the
 * database, so a double click can never count twice.
 */
export function useSetReviewHelpful(kind: ReviewSubjectKind) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const prefix = ["reviews", kind];
  return useMutation({
    mutationFn: async (input: { reviewId: string; helpful: boolean }) => {
      const res = await setReviewHelpful({ kind, ...input });
      if (res.status !== 200 || !res.data) {
        throw new Error(res.message ?? "Couldn't save that.");
      }
      return res.data;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: prefix });
      const snapshot = queryClient.getQueriesData({ queryKey: prefix });
      queryClient.setQueriesData({ queryKey: prefix }, (old: unknown) =>
        patchReviewInData(old, input.reviewId, (r) =>
          withHelpfulVote(r, input.helpful),
        ),
      );
      return { snapshot };
    },
    onSuccess: (server, input) => {
      queryClient.setQueriesData({ queryKey: prefix }, (old: unknown) =>
        patchReviewInData(old, input.reviewId, (r) => ({
          ...r,
          helpfulCount: server.helpfulCount,
          viewerFoundHelpful: server.viewerFoundHelpful,
        })),
      );
    },
    onError: (error, _input, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that.",
      );
    },
  });
}

/** Block a reviewer account-wide; their reviews leave every list at once. */
export function useBlockReviewer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await setUserBlock({ userId, block: true });
      if (res.status !== 200) {
        throw new Error(res.message ?? "Couldn't block.");
      }
    },
    onSuccess: (_data, userId) => {
      queryClient.setQueriesData({ queryKey: ["reviews"] }, (old: unknown) =>
        removeReviewsInData(old, (r) => r.reviewerId === userId),
      );
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      queryClient.invalidateQueries({ queryKey: ["blocked-accounts"] });
    },
  });
}
