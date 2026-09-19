import { useSession } from "@/auth/SessionProvider";
import { ACTIVE_PROMOTIONS_KEY } from "@/features/promotions/useActivePromotions";
import { api } from "@/lib/api";
import type {
  ContentFeedItem,
  ContentFeedPage,
  ContentFeedSurface,
  ContentKind,
  ContentPublisherKind,
  FollowStatus,
  FollowTargetKind,
} from "@abonten/types/contentType";
import { useToast } from "@abonten/ui-native";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { patchProfileFollow } from "../profile/usePublicProfile";
import { CONTENT_KEY } from "./useContentProgram";
import { getContentViewerKey } from "./useContentTelemetry";

// Spotlight + Stories data for the app. Everything goes through
// /api/mobile/content (the tables have no client grants). Keys include the
// signed-in user so signing in or out never shows the other answer.

type Envelope<T> = { status: number; message?: string; data?: T };

function unwrap<T>(res: Envelope<T>): T {
  if (res.status !== 200 || res.data === undefined) {
    throw new Error(res.message ?? "Something went wrong. Please try again.");
  }
  return res.data;
}

// ── Feed ────────────────────────────────────────────────────────────

/**
 * Only the Nearby feed is defined by a position. The rough position sent
 * with the other surfaces (sponsored placement) is not part of their
 * identity: keying on it split one feed into a cache entry per kilometre,
 * so a feed restored after a restart was unreachable whenever the last
 * known fix had moved or expired.
 */
export function contentFeedKey(
  userId: string | null,
  surface: ContentFeedSurface,
  coords: { lat: number; lng: number } | null,
) {
  return [
    ...CONTENT_KEY,
    "feed",
    userId,
    surface,
    surface === "nearby" && coords
      ? `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`
      : null,
  ] as const;
}

/**
 * The Spotlight feed. It is NEVER refetched behind the viewer's back: the
 * feed is ranked, so a background refetch (on mount, focus or reconnect)
 * re-orders the pages under whoever is watching — the video they are on
 * jumps to another position. It changes only when the person asks
 * (tab re-press, pull down: `useRefreshContentFeed`), when the list is
 * empty or failed, or when a restored cache is old on open.
 */
export function useContentFeed(
  surface: ContentFeedSurface,
  coords: { lat: number; lng: number } | null,
  enabled: boolean,
) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: contentFeedKey(session?.user.id ?? null, surface, coords),
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ContentFeedPage> =>
      unwrap(
        await api.content.feed({
          surface,
          cursor: pageParam,
          lat: coords?.lat,
          lng: coords?.lng,
          viewerKey: await getContentViewerKey(),
        }),
      ),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Replaces the feed with a fresh first page. Later pages are dropped first,
 * so only ONE request is made (a plain refetch of an infinite query
 * re-requests every page already loaded, in sequence). A refresh already in
 * flight is joined rather than restarted, so a double tap is one request.
 * Rejects when it fails; the existing pages stay on screen.
 */
export function useRefreshContentFeed() {
  const qc = useQueryClient();
  return useCallback(
    async (key: readonly unknown[]) => {
      const state = qc.getQueryState(key);
      if (state?.fetchStatus === "fetching") {
        await qc.refetchQueries(
          { queryKey: key, exact: true },
          { cancelRefetch: false, throwOnError: true },
        );
        return;
      }
      qc.setQueryData<InfiniteData<ContentFeedPage, string | null>>(
        key,
        (old) =>
          old && old.pages.length > 1
            ? {
                pages: old.pages.slice(0, 1),
                pageParams: old.pageParams.slice(0, 1),
              }
            : old,
      );
      await qc.refetchQueries(
        { queryKey: key, exact: true },
        { throwOnError: true },
      );
    },
    [qc],
  );
}

export function flattenFeed(
  pages: ContentFeedPage[] | undefined,
): ContentFeedItem[] {
  const seen = new Set<string>();
  const out: ContentFeedItem[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.post.id)) continue;
      seen.add(item.post.id);
      out.push(item);
    }
  }
  return out;
}

export function useContentPost(postId: string | undefined) {
  const { session } = useSession();
  return useQuery({
    queryKey: [...CONTENT_KEY, "post", session?.user.id ?? null, postId],
    enabled: !!postId,
    queryFn: () => api.content.post(postId as string),
  });
}

// ── Engagement ──────────────────────────────────────────────────────
// Shared cache state; see usePostEngagement.ts.
export { usePostEngagement } from "./usePostEngagement";

// ── Follow ──────────────────────────────────────────────────────────

export function useFollow(
  kind: FollowTargetKind,
  targetId: string | undefined,
  enabled: boolean,
  /** Already known from a post document: skip the status request. */
  known?: boolean,
) {
  const { session } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const key = [
    ...CONTENT_KEY,
    "follow",
    session?.user.id ?? null,
    kind,
    targetId,
  ];

  const status = useQuery({
    queryKey: key,
    enabled: enabled && !!targetId && known === undefined,
    queryFn: async (): Promise<FollowStatus> => {
      const res = await api.content.followStatus(kind, targetId as string);
      return res.status === 200 && res.data
        ? res.data
        : { following: false, followerCount: 0 };
    },
    staleTime: 60_000,
  });

  const rollback = (
    following: boolean,
    context: { previous?: FollowStatus; delta: number } | undefined,
  ) => {
    qc.setQueryData(key, context?.previous);
    if (kind === "organizer" && targetId && context) {
      patchProfileFollow(qc, targetId, {
        following: !following,
        delta: -context.delta,
      });
    }
  };

  const toggle = useMutation({
    mutationFn: (following: boolean) =>
      api.content.setFollow(kind, targetId as string, following),
    onMutate: (following) => {
      const previous =
        qc.getQueryData<FollowStatus>(key) ??
        (known === undefined
          ? undefined
          : { following: known, followerCount: 0 });
      const wasFollowing = previous?.following ?? !following;
      const delta = following === wasFollowing ? 0 : following ? 1 : -1;
      if (previous) {
        qc.setQueryData<FollowStatus>(key, {
          following,
          followerCount: Math.max(0, previous.followerCount + delta),
        });
      }
      // The profile header shows the same number: move it with the button.
      if (kind === "organizer" && targetId) {
        patchProfileFollow(qc, targetId, { following, delta });
      }
      return { previous, delta };
    },
    onSuccess: (res, following, context) => {
      if (res.status !== 200 || !res.data) {
        rollback(following, context);
        toast.error(res.message ?? "Couldn't update this follow.");
        return;
      }
      qc.setQueryData<FollowStatus>(key, res.data);
      if (kind === "organizer" && targetId) {
        patchProfileFollow(qc, targetId, {
          following: res.data.following,
          followerCount: res.data.followerCount,
        });
      }
      qc.invalidateQueries({ queryKey: [...CONTENT_KEY, "stories"] });
    },
    onError: (_e, following, context) => {
      rollback(following, context);
      toast.error("Couldn't update this follow.");
    },
  });

  return { status, toggle };
}

// ── Stories ─────────────────────────────────────────────────────────

export function useStoryTray(enabled: boolean) {
  const { session } = useSession();
  return useQuery({
    queryKey: [...CONTENT_KEY, "stories", "tray", session?.user.id ?? null],
    enabled: enabled && !!session,
    queryFn: async () => unwrap(await api.content.storyTray()),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useStorySequence(
  publisherKind: ContentPublisherKind | undefined,
  publisherId: string | undefined,
) {
  const { session } = useSession();
  return useQuery({
    queryKey: [
      ...CONTENT_KEY,
      "stories",
      "sequence",
      session?.user.id ?? null,
      publisherKind,
      publisherId,
    ],
    enabled: !!publisherKind && !!publisherId,
    queryFn: async () =>
      unwrap(
        await api.content.storySequence(
          publisherKind as ContentPublisherKind,
          publisherId as string,
        ),
      ),
    staleTime: 30_000,
  });
}

// ── Comments ────────────────────────────────────────────────────────

// Comment lists, sending, likes and realtime live in commentThread.ts.
export { useComments } from "./commentThread";

// ── Creator ─────────────────────────────────────────────────────────

export function useOwnContent(kind: ContentKind) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: [...CONTENT_KEY, "own", session?.user.id ?? null, kind],
    enabled: !!session,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(await api.content.mine({ kind, cursor: pageParam })),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });
}

/** Your own Spotlights in one state — the profile's Published / Drafts. */
export function useOwnSpotlights(
  status: "published" | "draft",
  enabled: boolean,
) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: [
      ...CONTENT_KEY,
      "own",
      session?.user.id ?? null,
      "spotlight",
      status,
    ],
    enabled: enabled && !!session,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.content.mine({
          kind: "spotlight",
          status,
          cursor: pageParam,
        }),
      ),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });
}

/** Spotlights you saved. Private: only ever requested for yourself. */
export function useSavedSpotlights(enabled: boolean) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: [...CONTENT_KEY, "saved", session?.user.id ?? null],
    enabled: enabled && !!session,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(await api.content.saved(pageParam)),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });
}

export function usePublisherSpotlights(
  publisherKind: "organizer" | "place",
  publisherId: string | undefined,
  enabled: boolean,
) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: [
      ...CONTENT_KEY,
      "publisher",
      session?.user.id ?? null,
      publisherKind,
      publisherId,
    ],
    enabled: enabled && !!publisherId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.content.publisher({
          publisherKind,
          publisherId: publisherId as string,
          kind: "spotlight",
          cursor: pageParam,
        }),
      ),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });
}

export function useOwnCampaigns() {
  const { session } = useSession();
  return useQuery({
    queryKey: [...CONTENT_KEY, "campaigns", session?.user.id ?? null],
    enabled: !!session,
    queryFn: async () => unwrap(await api.content.campaigns()),
  });
}

export function useCampaign(campaignId: string | undefined) {
  const { session } = useSession();
  return useQuery({
    queryKey: [
      ...CONTENT_KEY,
      "campaigns",
      session?.user.id ?? null,
      campaignId,
    ],
    enabled: !!campaignId && !!session,
    queryFn: async () =>
      unwrap(await api.content.campaign(campaignId as string)),
  });
}

export function usePromotionOptions(enabled: boolean) {
  return useQuery({
    queryKey: [...CONTENT_KEY, "promotion-options"],
    enabled,
    queryFn: async () => unwrap(await api.content.promotionOptions()),
    staleTime: 5 * 60_000,
  });
}

/** Server-priced estimate; the caller debounces the request. */
export function usePromotionEstimate(
  request: {
    postId: string;
    budgetMinor: number;
    durationDays: number;
    targeting: { area: "everywhere" } | { area: "near_post"; radiusKm: number };
  } | null,
) {
  return useQuery({
    queryKey: [...CONTENT_KEY, "promotion-estimate", JSON.stringify(request)],
    enabled: !!request,
    placeholderData: (prev) => prev,
    retry: false,
    queryFn: async () =>
      unwrap(
        await api.content.estimatePromotion(
          request as NonNullable<typeof request>,
        ),
      ),
  });
}

export function useAttachableEvents(enabled: boolean) {
  const { session } = useSession();
  return useQuery({
    queryKey: [...CONTENT_KEY, "attachable-events", session?.user.id ?? null],
    enabled: enabled && !!session,
    queryFn: async () => unwrap(await api.content.attachableEvents()),
    staleTime: 5 * 60_000,
  });
}

export function useInsights(postId: string | undefined, days: number) {
  return useQuery({
    queryKey: [...CONTENT_KEY, "insights", postId, days],
    enabled: !!postId,
    queryFn: async () =>
      unwrap(await api.content.insights(postId as string, days)),
  });
}

/**
 * After a post or campaign changes: everything content-related is stale —
 * except the Spotlight feed, which only ever changes on the viewer's own
 * refresh (a background re-rank would move the video they are watching;
 * see useContentFeed). Promotions shown in Settings follow campaigns.
 */
export function useInvalidateContent() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({
      queryKey: CONTENT_KEY,
      predicate: (q) => q.queryKey[2] !== "feed",
    });
    void qc.invalidateQueries({ queryKey: ACTIVE_PROMOTIONS_KEY });
  };
}
