import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import type {
  ContentCounts,
  ContentFeedItem,
  ContentFeedPage,
  ContentFeedSurface,
  ContentKind,
  ContentPostDocument,
  ContentPublisherKind,
  ContentReactionEmoji,
  ContentShareChannel,
  FollowStatus,
  FollowTargetKind,
} from "@abonten/types/contentType";
import { useToast } from "@abonten/ui-native";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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

export function useContentFeed(
  surface: ContentFeedSurface,
  coords: { lat: number; lng: number } | null,
  enabled: boolean,
) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: [
      ...CONTENT_KEY,
      "feed",
      session?.user.id ?? null,
      surface,
      coords ? `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}` : null,
    ],
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
    staleTime: 60_000,
  });
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

// ── Engagement (optimistic, per card) ───────────────────────────────

export function usePostEngagement(
  post: ContentPostDocument,
  requireSignIn: () => boolean,
) {
  const toast = useToast();
  const qc = useQueryClient();
  const [liked, setLiked] = useState(post.viewer.liked);
  const [saved, setSaved] = useState(post.viewer.saved);
  const [reaction, setReaction] = useState<ContentReactionEmoji | null>(
    post.viewer.reaction,
  );
  const [notInterested, setNotInterested] = useState(post.viewer.notInterested);
  const [counts, setCounts] = useState<ContentCounts>(post.counts);
  const pending = useRef(0);

  useEffect(() => {
    if (pending.current > 0) return;
    setLiked(post.viewer.liked);
    setSaved(post.viewer.saved);
    setReaction(post.viewer.reaction);
    setNotInterested(post.viewer.notInterested);
    setCounts(post.counts);
  }, [post]);

  async function run<T>(
    optimistic: () => () => void,
    call: () => Promise<Envelope<T>>,
    onData?: (data: T | undefined) => void,
  ) {
    if (!requireSignIn()) return;
    const undo = optimistic();
    pending.current += 1;
    try {
      const res = await call();
      if (res.status !== 200) {
        undo();
        toast.error(res.message ?? "Something went wrong.");
        return;
      }
      onData?.(res.data);
    } catch {
      undo();
      toast.error("Something went wrong. Check your connection.");
    } finally {
      pending.current -= 1;
    }
  }

  return {
    liked,
    saved,
    reaction,
    notInterested,
    counts,
    setCounts,
    toggleLike: () => {
      const next = !liked;
      return run(
        () => {
          setLiked(next);
          setCounts((c) => ({
            ...c,
            likes: Math.max(0, c.likes + (next ? 1 : -1)),
          }));
          return () => {
            setLiked(!next);
            setCounts((c) => ({
              ...c,
              likes: Math.max(0, c.likes + (next ? -1 : 1)),
            }));
          };
        },
        () => api.content.like(post.id, next),
        (data) => {
          const d = data as { counts?: ContentCounts } | undefined;
          if (d?.counts) setCounts(d.counts);
        },
      );
    },
    toggleSave: () => {
      const next = !saved;
      return run(
        () => {
          setSaved(next);
          return () => setSaved(!next);
        },
        () => api.content.save(post.id, next),
        () => {
          qc.invalidateQueries({ queryKey: [...CONTENT_KEY, "saved"] });
          toast.success(next ? "Saved" : "Removed from saved");
        },
      );
    },
    react: (emoji: ContentReactionEmoji) => {
      const previous = reaction;
      const next = previous === emoji ? null : emoji;
      return run(
        () => {
          setReaction(next);
          return () => setReaction(previous);
        },
        () => api.content.react(post.id, next),
      );
    },
    markNotInterested: (value = true) =>
      run(
        () => {
          setNotInterested(value);
          return () => setNotInterested(!value);
        },
        () => api.content.notInterested(post.id, value),
      ),
    recordShare: async (channel: ContentShareChannel) => {
      setCounts((c) => ({ ...c, shares: c.shares + 1 }));
      try {
        await api.content.share(post.id, channel);
      } catch {
        // A missed share count is harmless.
      }
    },
  };
}

// ── Follow ──────────────────────────────────────────────────────────

export function useFollow(
  kind: FollowTargetKind,
  targetId: string | undefined,
  enabled: boolean,
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
    enabled: enabled && !!targetId,
    queryFn: async (): Promise<FollowStatus> => {
      const res = await api.content.followStatus(kind, targetId as string);
      return res.status === 200 && res.data
        ? res.data
        : { following: false, followerCount: 0 };
    },
    staleTime: 60_000,
  });

  const toggle = useMutation({
    mutationFn: (following: boolean) =>
      api.content.setFollow(kind, targetId as string, following),
    onMutate: (following) => {
      const previous = qc.getQueryData<FollowStatus>(key);
      if (previous) {
        const delta = following === previous.following ? 0 : following ? 1 : -1;
        qc.setQueryData<FollowStatus>(key, {
          following,
          followerCount: Math.max(0, previous.followerCount + delta),
        });
      }
      return { previous };
    },
    onSuccess: (res, _following, context) => {
      if (res.status !== 200 || !res.data) {
        qc.setQueryData(key, context?.previous);
        toast.error(res.message ?? "Couldn't update this follow.");
        return;
      }
      qc.setQueryData<FollowStatus>(key, res.data);
      qc.invalidateQueries({ queryKey: [...CONTENT_KEY, "stories"] });
    },
    onError: (_e, _following, context) => {
      qc.setQueryData(key, context?.previous);
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

export function useComments(
  postId: string,
  parentId: string | null,
  enabled: boolean,
) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: [
      ...CONTENT_KEY,
      "comments",
      postId,
      parentId,
      session?.user.id ?? null,
    ],
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.content.comments(postId, { parentId, cursor: pageParam }),
      ),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });
}

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

export function useInvalidateContent() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CONTENT_KEY });
}
