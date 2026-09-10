import { useCallback, useRef, useState } from "react";
import type {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";

// Scroll/anchor coordination for the inverted message list.
//
// An inverted FlatList renders the newest row at the bottom of the screen
// but at scroll offset 0 — so "at the bottom of the conversation" means
// `contentOffset.y` near zero, and `scrollToOffset({ offset: 0 })` jumps to
// the latest message.
//
// The rules (task §2 / §3):
//   • the user just sent  → always scroll to the latest (`scrollToBottom`).
//   • a message arrived    → if they were already at the bottom, keep them
//     pinned there; if they had scrolled up to read history, DON'T yank
//     them down — raise the unseen counter for the "N new messages" pill.
//   • keyboard opened      → if at the bottom, stay at the bottom.
//
// `atBottomRef` is the source of truth for those branches (state lags a
// frame behind a fast scroll); `atBottom` state drives the pill's
// visibility.

const AT_BOTTOM_THRESHOLD = 80;

export function useChatScroll<T>() {
  // The hook only ever calls `scrollToOffset`, which exists regardless of
  // the row type; `T` is threaded through purely so the screen's
  // `<FlatList<ChatEntry> ref={...}>` lines up.
  const listRef = useRef<FlatList<T>>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const next = y <= AT_BOTTOM_THRESHOLD;
    if (atBottomRef.current !== next) {
      atBottomRef.current = next;
      setAtBottom(next);
    }
    if (next) setUnseenCount((n) => (n === 0 ? n : 0));
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    listRef.current?.scrollToOffset({ offset: 0, animated });
    atBottomRef.current = true;
    setAtBottom(true);
    setUnseenCount(0);
  }, []);

  /**
   * Content grew (a row was added or resized) while the user was already at
   * the bottom — stay there. `maintainVisibleContentPosition` deliberately
   * holds the old position when a row is prepended, and followOwnMessage's
   * one-frame scroll can fire before the optimistic row is laid out, which
   * left the sender's own message just below the viewport (seen on device
   * 2026-09-10: two offline sends, neither visible until a manual scroll).
   * Reading history is unaffected: older pages arrive while atBottomRef is
   * false, so nothing moves.
   */
  const onContentSizeChange = useCallback(() => {
    if (atBottomRef.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, []);

  /** The current user sent something — always follow it down. */
  const followOwnMessage = useCallback(() => {
    // A frame's grace so the optimistic row is laid out before we scroll.
    requestAnimationFrame(() => scrollToBottom(true));
  }, [scrollToBottom]);

  /** A message from someone else landed (realtime / refetch). */
  const noteIncoming = useCallback(() => {
    if (atBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom(true));
    } else {
      setUnseenCount((n) => n + 1);
    }
  }, [scrollToBottom]);

  /** Keyboard just opened — hold the bottom position if we were there. */
  const onKeyboardShow = useCallback(() => {
    if (atBottomRef.current) scrollToBottom(false);
  }, [scrollToBottom]);

  return {
    listRef,
    atBottom,
    atBottomRef,
    unseenCount,
    onScroll,
    onContentSizeChange,
    scrollToBottom,
    followOwnMessage,
    noteIncoming,
    onKeyboardShow,
  };
}
