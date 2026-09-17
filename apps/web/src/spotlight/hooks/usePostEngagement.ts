"use client";

import { recordContentShare } from "@/actions/content/recordContentShare";
import { setContentLike } from "@/actions/content/setContentLike";
import { setContentNotInterested } from "@/actions/content/setContentNotInterested";
import { setContentReaction } from "@/actions/content/setContentReaction";
import { setContentSave } from "@/actions/content/setContentSave";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useToast } from "@/hooks/useToast";
import type {
  ContentCounts,
  ContentPostDocument,
  ContentReactionEmoji,
  ContentShareChannel,
} from "@abonten/types/contentType";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { dataOf, messageOf } from "../lib/result";

// Local, optimistic engagement state for one post card. Each switch sends
// the desired end state (not a toggle), so double taps and retries are
// idempotent on the server; a failure puts the previous state back.

export function usePostEngagement(post: ContentPostDocument) {
  const requireAuth = useRequireAuth();
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

  // A refetched document replaces local state only when nothing is in flight.
  useEffect(() => {
    if (pending.current > 0) return;
    setLiked(post.viewer.liked);
    setSaved(post.viewer.saved);
    setReaction(post.viewer.reaction);
    setNotInterested(post.viewer.notInterested);
    setCounts(post.counts);
  }, [post]);

  const run = async <R extends { status: number; message?: string }>(
    optimistic: () => () => void,
    call: () => Promise<R>,
    onData?: (res: R) => void,
  ) => {
    if (!(await requireAuth())) return;
    const undo = optimistic();
    pending.current += 1;
    try {
      const res = await call();
      if (res.status !== 200) {
        undo();
        toast.error(messageOf(res));
        return;
      }
      onData?.(res);
    } catch {
      undo();
      toast.error("Something went wrong. Please try again.");
    } finally {
      pending.current -= 1;
    }
  };

  const toggleLike = () => {
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
      () => setContentLike({ postId: post.id, liked: next }),
      (res) => {
        const data = dataOf(res as Awaited<ReturnType<typeof setContentLike>>);
        if (data) setCounts(data.counts);
      },
    );
  };

  const toggleSave = () => {
    const next = !saved;
    return run(
      () => {
        setSaved(next);
        return () => setSaved(!next);
      },
      () => setContentSave({ postId: post.id, saved: next }),
      (res) => {
        const data = dataOf(res as Awaited<ReturnType<typeof setContentSave>>);
        if (data) setCounts(data.counts);
        qc.invalidateQueries({ queryKey: ["content", "saved"] });
        toast.success(next ? "Saved." : "Removed from saved.");
      },
    );
  };

  const react = (emoji: ContentReactionEmoji) => {
    const previous = reaction;
    const next = previous === emoji ? null : emoji;
    return run(
      () => {
        setReaction(next);
        return () => setReaction(previous);
      },
      () => setContentReaction({ postId: post.id, emoji: next }),
    );
  };

  const markNotInterested = (value = true) =>
    run(
      () => {
        setNotInterested(value);
        return () => setNotInterested(!value);
      },
      () => setContentNotInterested({ postId: post.id, notInterested: value }),
      () => {
        if (value) {
          toast.success("Got it. You'll see fewer posts like this.");
        }
      },
    );

  /** Records a share after the visitor actually shared or copied the link. */
  const recordShare = async (channel: ContentShareChannel) => {
    setCounts((c) => ({ ...c, shares: c.shares + 1 }));
    try {
      await recordContentShare({ postId: post.id, channel });
    } catch {
      // A missed share count is harmless.
    }
  };

  return {
    liked,
    saved,
    reaction,
    notInterested,
    counts,
    setCounts,
    /** Local only — a reaction the server set another way (a Story reply). */
    setReaction,
    toggleLike,
    toggleSave,
    react,
    markNotInterested,
    recordShare,
  };
}
