import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { createLatestIntentToggle } from "@abonten/core/content/latestIntentToggle";
import type {
  ContentCounts,
  ContentPostDocument,
  ContentReactionEmoji,
  ContentShareChannel,
  ContentViewerState,
} from "@abonten/types/contentType";
import { type ToastApi, useToast } from "@abonten/ui-native";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { patchPostEverywhere } from "./postCacheSync";
import { CONTENT_KEY } from "./useContentProgram";

// Likes, saves, reactions and "not interested" on a post — as SHARED cache
// state. Every change is written into every cached copy of the post
// (postCacheSync), so the feed, the opened post, grids and Story sequences
// all agree; the old per-card useState copies never saw each other's
// changes and were overwritten by whichever response came back last.
//
// Like and save are switches that survive rapid taps (latestIntentToggle):
// one request in flight per post, then one more for the final intent, and
// the count shown is always derived from the count at the start of the burst
// plus the viewer's own change — never from a stale response.

type Envelope<T> = { status: number; message?: string; data?: T };
type CountsResult = { counts?: ContentCounts };

// Newest toast host, so a failure reported after the card unmounted (you
// scrolled on while the request was out) still tells you.
let toastHost: ToastApi | null = null;

type Baseline = { on: boolean; count: number };

function makeSwitch(
  field: "liked" | "saved",
  countField: "likes" | "saves",
  send: (postId: string, value: boolean) => Promise<Envelope<CountsResult>>,
  failure: string,
  afterSettle?: () => void,
) {
  const baselines = new Map<string, Baseline>();
  const toggle = createLatestIntentToggle<CountsResult | undefined>({
    send: async (postId, value) => {
      const res = await send(postId, value);
      if (res.status !== 200) throw new Error(res.message ?? failure);
      return res.data;
    },
    onSettled: (postId, value, result) => {
      baselines.delete(postId);
      patchPostEverywhere(queryClient, postId, (p) => ({
        ...p,
        viewer: { ...p.viewer, [field]: value },
        counts: result?.counts ? result.counts : p.counts,
      }));
      afterSettle?.();
    },
    onFailed: (postId, confirmed) => {
      const base = baselines.get(postId);
      baselines.delete(postId);
      if (base) {
        const count =
          base.count + (confirmed === base.on ? 0 : confirmed ? 1 : -1);
        patchPostEverywhere(queryClient, postId, (p) => ({
          ...p,
          viewer: { ...p.viewer, [field]: confirmed },
          counts: { ...p.counts, [countField]: Math.max(0, count) },
        }));
      }
      toastHost?.error(failure);
    },
  });

  return {
    isPending: (postId: string) => toggle.isPending(postId),
    /** Paints the new state everywhere and queues the request. */
    flip(post: ContentPostDocument, current: { on: boolean; count: number }) {
      let base = baselines.get(post.id);
      if (!base) {
        base = { on: current.on, count: current.count };
        baselines.set(post.id, base);
      }
      const desired = !current.on;
      const count = Math.max(
        0,
        base.count + (desired ? 1 : 0) - (base.on ? 1 : 0),
      );
      patchPostEverywhere(queryClient, post.id, (p) => ({
        ...p,
        viewer: { ...p.viewer, [field]: desired },
        counts: { ...p.counts, [countField]: count },
      }));
      toggle.set(post.id, desired, base.on);
      return { desired, count };
    },
  };
}

const likeSwitch = makeSwitch(
  "liked",
  "likes",
  (id, v) => api.content.like(id, v),
  "Couldn't update that like.",
);
const saveSwitch = makeSwitch(
  "saved",
  "saves",
  (id, v) => api.content.save(id, v),
  "Couldn't update your saved Spotlights.",
  () => queryClient.invalidateQueries({ queryKey: [...CONTENT_KEY, "saved"] }),
);

/** A like of ours is still being sent: its response, not a broadcast, decides. */
export function isPostLikePending(postId: string): boolean {
  return likeSwitch.isPending(postId);
}

export function usePostEngagement(
  post: ContentPostDocument,
  requireSignIn: () => boolean,
) {
  const qc = useQueryClient();
  const toast = useToast();
  toastHost = toast;

  // A post that is not in any cache (rare: built on the fly) still shows the
  // viewer's change through this overlay; once the cached copy catches up —
  // the `post` prop changes — the overlay is dropped.
  const [overlay, setOverlay] = useState<{
    viewer: Partial<ContentViewerState>;
    counts: Partial<ContentCounts>;
  } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the cached post changes
  useEffect(() => setOverlay(null), [post]);

  const viewer = useMemo(
    () => ({ ...post.viewer, ...overlay?.viewer }),
    [post.viewer, overlay],
  );
  const counts = useMemo(
    () => ({ ...post.counts, ...overlay?.counts }),
    [post.counts, overlay],
  );

  const canWrite = useCallback(() => {
    if (!requireSignIn()) return false;
    if (!onlineManager.isOnline()) {
      toast.info("You're offline. Try again when you're connected.");
      return false;
    }
    return true;
  }, [requireSignIn, toast]);

  const patch = useCallback(
    (
      viewerPatch: Partial<ContentViewerState>,
      countsPatch: Partial<ContentCounts> = {},
    ) => {
      setOverlay((o) => ({
        viewer: { ...o?.viewer, ...viewerPatch },
        counts: { ...o?.counts, ...countsPatch },
      }));
      patchPostEverywhere(qc, post.id, (p) => ({
        ...p,
        viewer: { ...p.viewer, ...viewerPatch },
        counts: { ...p.counts, ...countsPatch },
      }));
    },
    [qc, post.id],
  );

  async function once<T>(
    optimistic: () => () => void,
    call: () => Promise<Envelope<T>>,
    failure: string,
  ) {
    if (!canWrite()) return;
    const undo = optimistic();
    try {
      const res = await call();
      if (res.status !== 200) {
        undo();
        toast.error(res.message ?? failure);
      }
    } catch {
      undo();
      toast.error(failure);
    }
  }

  return {
    liked: viewer.liked,
    saved: viewer.saved,
    reaction: viewer.reaction,
    notInterested: viewer.notInterested,
    counts,
    /** Local and cached only — for a reaction the server set another way (a Story reply). */
    setReaction: (reaction: ContentReactionEmoji | null) => patch({ reaction }),
    toggleLike: () => {
      if (!canWrite()) return;
      const { desired, count } = likeSwitch.flip(post, {
        on: viewer.liked,
        count: counts.likes,
      });
      setOverlay((o) => ({
        viewer: { ...o?.viewer, liked: desired },
        counts: { ...o?.counts, likes: count },
      }));
    },
    toggleSave: () => {
      if (!canWrite()) return;
      const { desired, count } = saveSwitch.flip(post, {
        on: viewer.saved,
        count: counts.saves,
      });
      setOverlay((o) => ({
        viewer: { ...o?.viewer, saved: desired },
        counts: { ...o?.counts, saves: count },
      }));
      toast.success(desired ? "Saved" : "Removed from saved");
    },
    react: (emoji: ContentReactionEmoji) => {
      const previous = viewer.reaction;
      const next = previous === emoji ? null : emoji;
      return once(
        () => {
          patch({ reaction: next });
          return () => patch({ reaction: previous });
        },
        () => api.content.react(post.id, next),
        "Couldn't send that reaction.",
      );
    },
    markNotInterested: (value = true) =>
      once(
        () => {
          patch({ notInterested: value });
          return () => patch({ notInterested: !value });
        },
        () => api.content.notInterested(post.id, value),
        "Something went wrong.",
      ),
    recordShare: async (channel: ContentShareChannel) => {
      patch({}, { shares: counts.shares + 1 });
      try {
        await api.content.share(post.id, channel);
      } catch {
        // A missed share count is harmless.
      }
    },
  };
}
