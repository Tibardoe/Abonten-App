import { useSession } from "@/auth/SessionProvider";
import { ImageViewer } from "@/components/ImageViewer";
import { ReportSheet } from "@/components/ReportSheet";
import { AnchoredMenu } from "@/components/messaging/AnchoredMenu";
import { ChatToast } from "@/components/messaging/ChatToast";
import { Composer } from "@/components/messaging/Composer";
import { ConversationHeader } from "@/components/messaging/ConversationHeader";
import { DaySeparator } from "@/components/messaging/DaySeparator";
import {
  MessageActionOverlay,
  type MessageMenuTarget,
} from "@/components/messaging/MessageActionOverlay";
import { MessageBubble } from "@/components/messaging/MessageBubble";
import { NewMessagesPill } from "@/components/messaging/NewMessagesPill";
import { SystemMessage } from "@/components/messaging/SystemMessage";
import { TypingIndicator } from "@/components/messaging/TypingIndicator";
import type { Rect } from "@/components/messaging/contextMenu/menuPlacement";
import { setActiveConversation } from "@/features/messaging/activeConversation";
import {
  type ChatEntry,
  buildChatEntries,
} from "@/features/messaging/chatEntries";
import {
  CLIPBOARD_SUPPORTED,
  copyText,
} from "@/features/messaging/clipboardSupport";
import { useChatScroll } from "@/features/messaging/useChatScroll";
import {
  flattenMessages,
  useConversationDetail,
  useConversationMessages,
} from "@/features/messaging/useConversation";
import { useConversationRealtime } from "@/features/messaging/useConversationRealtime";
import { useMessageOutbox } from "@/features/messaging/useMessageOutbox";
import {
  useBlockParticipant,
  useDeleteMessage,
  useEditMessage,
  useMarkConversationRead,
  useSetConversationState,
  useToggleReaction,
} from "@/features/messaging/useMessagingActions";
import { hapticSelection } from "@/lib/haptics";
import { isUuid } from "@/lib/uuid";
import type { MessageRow } from "@abonten/api-client";
import {
  MESSAGE_EDIT_WINDOW_MINUTES,
  MESSAGE_MAX_LENGTH,
} from "@abonten/types/messagingType";
import {
  AppText,
  Button,
  Icon,
  type IoniconName,
  Refresher,
  Sheet,
  SheetOption,
  Spinner,
  useKeyboardVisible,
  useToast,
} from "@abonten/ui-native";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  View,
} from "react-native";

function canEdit(m: MessageRow, myId: string | undefined): boolean {
  if (!myId || m.sender_id !== myId) return false;
  if (m.message_type !== "text" || m.deleted_at) return false;
  const ageMin = (Date.now() - new Date(m.created_at).getTime()) / 60_000;
  return ageMin <= MESSAGE_EDIT_WINDOW_MINUTES;
}

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const valid = isUuid(conversationId);
  const { session } = useSession();
  const myId = session?.user.id;
  const c = useThemeColors();
  const kbVisible = useKeyboardVisible();
  const chat = useChatScroll<ChatEntry>();

  const detailQ = useConversationDetail(valid ? conversationId : undefined);
  const messagesQ = useConversationMessages(valid ? conversationId : undefined);
  const { outbox, send, retry, reconcile } = useMessageOutbox(conversationId);

  // The user just sent something — always follow it to the bottom.
  const handleSend = useCallback(
    (draft: Parameters<typeof send>[0]) => {
      send(draft);
      chat.followOwnMessage();
    },
    [send, chat],
  );

  const markRead = useMarkConversationRead();
  const editMsg = useEditMessage(conversationId);
  const deleteMsg = useDeleteMessage(conversationId);
  const setState = useSetConversationState();
  const block = useBlockParticipant();
  const toggleReaction = useToggleReaction(conversationId);

  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const [menuTarget, setMenuTarget] = useState<MessageMenuTarget | null>(null);
  const [convMenuAnchor, setConvMenuAnchor] = useState<Rect | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState<MessageRow | null>(null);
  const [editText, setEditText] = useState("");
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const pendingScrollRef = useRef<{ id: string; tries: number } | null>(null);

  const lastMarkedRef = useRef<string>("");

  const context =
    detailQ.data?.status === 200 ? (detailQ.data.data ?? null) : null;
  const notFound = detailQ.data?.status === 404;

  const serverMessages = flattenMessages(messagesQ.data?.pages);
  const entries = useMemo(
    () => buildChatEntries(serverMessages, outbox, myId),
    [serverMessages, outbox, myId],
  );

  // No cached pages AND not yet errored -> genuine first load. A return
  // visit has `messagesQ.data` from the (now long-lived) query cache, so the
  // thread renders instantly and only a quiet background refetch runs.
  const noThreadYet = messagesQ.data === undefined && !messagesQ.isError;

  // Once the server thread contains a client-generated id, the matching
  // optimistic row has done its job — drop it from the outbox so a long
  // session doesn't accumulate stale entries (a lost send response would
  // otherwise leave a "sending" row forever, even though it's not rendered).
  useEffect(() => {
    const confirmed = new Set(
      serverMessages
        .map((m) => m.client_generated_id)
        .filter((v): v is string => !!v),
    );
    reconcile(confirmed);
  }, [serverMessages, reconcile]);

  // The other participant's read position -> our "Seen" ticks.
  const otherReadAt = useMemo(() => {
    const other = context?.participants.find((p) => p.user_id !== myId);
    return other ? new Date(other.last_read_at).getTime() : 0;
  }, [context, myId]);

  const otherUserId = context?.participants.find(
    (p) => p.user_id !== myId,
  )?.user_id;

  // "Replying to X" label for the composer preview (spec §10–11).
  const replyingToName = useMemo(() => {
    if (!replyingTo) return undefined;
    if (replyingTo.sender_id === myId) return "yourself";
    const p = context?.participants.find(
      (x) => x.user_id === replyingTo.sender_id,
    );
    return p?.profile?.full_name || p?.profile?.username || "them";
  }, [replyingTo, myId, context]);
  const iBlockedThem =
    !!otherUserId && (context?.blocked_user_ids ?? []).includes(otherUserId);
  const closed = context?.status === "closed";

  const markNewestRead = useCallback(() => {
    if (!valid) return;
    const newest = serverMessages[0];
    if (!newest || newest.created_at === lastMarkedRef.current) return;
    lastMarkedRef.current = newest.created_at;
    // No `upTo` — the RPC defaults to now(), which reads past every message.
    // (Passing newest.created_at was doubly broken: the raw "+00:00" string
    // failed the datetime validation, and even normalised its millisecond
    // precision landed just before a microsecond-stamped message, so the
    // unread count never reached zero.)
    markRead.mutate({ conversationId });
  }, [valid, serverMessages, conversationId, markRead]);

  // A message from the other side landed: the thread is open so mark it
  // read, and let the scroll logic decide whether to follow it down or
  // raise the "N new messages" pill.
  const onIncomingMessage = useCallback(() => {
    markNewestRead();
    chat.noteIncoming();
  }, [markNewestRead, chat]);

  const { typingUserIds, sendTyping } = useConversationRealtime(
    valid ? conversationId : undefined,
    { onIncomingMessage },
  );

  // Keyboard opened — if the reader was already at the latest message, keep
  // them pinned there rather than leaving the newest bubble under the
  // keyboard.
  useEffect(() => {
    if (kbVisible) chat.onKeyboardShow();
  }, [kbVisible, chat]);

  // Mark read when the thread is focused and whenever a fresh page settles.
  useFocusEffect(
    useCallback(() => {
      setActiveConversation(valid ? conversationId : null);
      markNewestRead();
      return () => setActiveConversation(null);
    }, [valid, conversationId, markNewestRead]),
  );

  const onEndReached = useCallback(() => {
    if (messagesQ.hasNextPage && !messagesQ.isFetchingNextPage) {
      messagesQ.fetchNextPage();
    }
  }, [messagesQ]);

  // Stable identity: MessageBubble is memoised, and a fresh handler on every
  // render would defeat that and re-render every bubble in the thread on any
  // state change (a keystroke in the composer, a typing indicator, an
  // incoming message).
  const openMessageMenu = useCallback(
    (m: MessageRow, rect: Rect) => setMenuTarget({ message: m, rect }),
    [],
  );

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) =>
      toggleReaction.mutate(
        { messageId, emoji },
        {
          // The optimistic pill is applied/reverted in the mutation hook; the
          // screen just surfaces a lightweight failure note (spec §16).
          onSettled: (res) => {
            if (!res || res.status !== 200) setToast("Couldn't add reaction");
          },
        },
      ),
    [toggleReaction],
  );

  const handleCopy = useCallback(async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      hapticSelection();
      setToast("Copied");
    } else {
      setToast("Couldn't copy");
    }
  }, []);

  // Jump to a message referenced by a reply quote (spec §11). If it isn't in
  // the loaded pages yet, page older messages in until it is (capped).
  const scrollToLoaded = useCallback(
    (messageId: string) => {
      const idx = entries.findIndex(
        (e) => e.kind === "msg" && e.message.id === messageId,
      );
      if (idx < 0) return false;
      chat.listRef.current?.scrollToIndex({
        index: idx,
        viewPosition: 0.4,
        animated: true,
      });
      setHighlightId(messageId);
      return true;
    },
    [entries, chat],
  );

  const scrollToMessage = useCallback(
    (messageId: string) => {
      if (!messageId) return;
      if (scrollToLoaded(messageId)) return;
      if (messagesQ.hasNextPage && !messagesQ.isFetchingNextPage) {
        pendingScrollRef.current = { id: messageId, tries: 0 };
        messagesQ.fetchNextPage();
      } else {
        setToast("Original message isn't loaded");
      }
    },
    [scrollToLoaded, messagesQ],
  );

  // Resolve a pending "scroll to reply target" as older pages arrive.
  // `scrollToLoaded` is re-created whenever `entries` changes (a new page
  // landing), so this re-runs on every page fetch without listing `entries`.
  useEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending) return;
    if (scrollToLoaded(pending.id)) {
      pendingScrollRef.current = null;
      return;
    }
    if (pending.tries >= 6 || !messagesQ.hasNextPage) {
      pendingScrollRef.current = null;
      setToast("Couldn't find that message");
      return;
    }
    if (!messagesQ.isFetchingNextPage) {
      pending.tries += 1;
      messagesQ.fetchNextPage();
    }
  }, [scrollToLoaded, messagesQ]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 1800);
    return () => clearTimeout(t);
  }, [highlightId]);

  const renderEntry = useCallback(
    ({ item }: { item: ChatEntry }) => {
      if (item.kind === "day") return <DaySeparator label={item.label} />;
      if (item.message.message_type === "system") {
        return <SystemMessage message={item.message} currentUserId={myId} />;
      }
      const seen =
        item.isMine &&
        !item.pending &&
        new Date(item.message.created_at).getTime() <= otherReadAt;
      return (
        <MessageBubble
          message={item.message}
          pending={item.pending}
          isMine={item.isMine}
          isGroupStart={item.isGroupStart}
          seen={seen}
          highlighted={item.message.id === highlightId}
          // While its lifted clone is on screen in the action overlay, hide
          // the real bubble so there's no "ghost" behind the lift-out.
          hiddenForMenu={menuTarget?.message.id === item.message.id}
          onPressImage={setViewerUri}
          onLongPress={openMessageMenu}
          onReply={setReplyingTo}
          onReplyQuotePress={scrollToMessage}
          onToggleReaction={handleToggleReaction}
          onRetry={retry}
        />
      );
    },
    [
      myId,
      otherReadAt,
      openMessageMenu,
      retry,
      highlightId,
      scrollToMessage,
      handleToggleReaction,
      menuTarget?.message.id,
    ],
  );

  function submitEdit() {
    if (!editing) return;
    const next = editText.trim();
    if (!next || next === editing.content) {
      setEditing(null);
      return;
    }
    editMsg.mutate(
      { messageId: editing.id, content: next },
      {
        onSettled: (res) => {
          if (res && res.status !== 200) {
            setToast(res.message ?? "Couldn't edit that message");
          }
          setEditing(null);
        },
      },
    );
  }

  function confirmDelete(m: MessageRow) {
    Alert.alert("Delete this message?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteMsg.mutate(m.id, {
            onSettled: (res) => {
              if (res && res.status !== 200) {
                setToast(res.message ?? "Couldn't delete that message");
              }
            },
          }),
      },
    ]);
  }

  if (!valid) {
    return (
      <View className="flex-1 bg-background">
        <ConversationHeader
          context={null}
          currentUserId={myId}
          onMenu={() => {}}
        />
        <View className="flex-1 items-center justify-center px-8">
          <AppText variant="muted">This conversation link is invalid.</AppText>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ConversationHeader
        context={context}
        currentUserId={myId}
        onMenu={setConvMenuAnchor}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {notFound ? (
          <View className="flex-1 items-center justify-center gap-3 px-8">
            <Icon name="lock-closed-outline" size={26} tone="muted" />
            <AppText variant="muted" className="text-center">
              This conversation isn't available.
            </AppText>
          </View>
        ) : noThreadYet ? (
          // Genuine first load only — never on a return visit, where the
          // cached pages render straight away and a background refetch
          // reconciles silently (task §4 / §14).
          <View className="flex-1 items-center justify-center">
            <Spinner />
          </View>
        ) : (
          <View className="flex-1">
            <FlatList
              ref={chat.listRef}
              data={entries}
              inverted
              keyExtractor={(e) => e.id}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              onScroll={chat.onScroll}
              onContentSizeChange={chat.onContentSizeChange}
              scrollEventThrottle={16}
              contentContainerClassName="py-3"
              onEndReached={onEndReached}
              onEndReachedThreshold={0.4}
              onScrollToIndexFailed={(info) => {
                // The reply target isn't laid out yet — nudge toward it, then
                // retry once the window has caught up.
                chat.listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });
                setTimeout(() => {
                  chat.listRef.current?.scrollToIndex({
                    index: info.index,
                    viewPosition: 0.4,
                    animated: true,
                  });
                }, 120);
              }}
              refreshControl={
                <Refresher
                  refreshing={
                    messagesQ.isRefetching && !messagesQ.isFetchingNextPage
                  }
                  onRefresh={() => messagesQ.refetch()}
                  tintColor={c["muted-foreground"]}
                />
              }
              ListHeaderComponent={
                typingUserIds.length > 0 ? <TypingIndicator /> : null
              }
              ListFooterComponent={
                messagesQ.isFetchingNextPage ? (
                  <View className="py-3">
                    <Spinner />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View className="flex-1 items-center gap-3 px-8 pt-16">
                  <AppText variant="muted" className="text-center">
                    {messagesQ.isError
                      ? "Couldn't load messages."
                      : "No messages yet — say hello."}
                  </AppText>
                  {messagesQ.isError ? (
                    <Button
                      title="Retry"
                      variant="outline"
                      onPress={() => messagesQ.refetch()}
                    />
                  ) : null}
                </View>
              }
              renderItem={renderEntry}
            />
            <NewMessagesPill
              count={chat.unseenCount}
              onPress={() => chat.scrollToBottom(true)}
            />
          </View>
        )}

        <Composer
          conversationId={conversationId}
          replyingTo={replyingTo}
          replyingToName={replyingToName}
          onCancelReply={() => setReplyingTo(null)}
          onSend={handleSend}
          onTyping={sendTyping}
          disabled={closed || iBlockedThem}
          disabledReason={
            closed
              ? "This conversation is closed."
              : iBlockedThem
                ? "You've blocked this person. Unblock them to send a message."
                : undefined
          }
        />
      </KeyboardAvoidingView>

      {/* Per-message contextual action overlay (spec §1–7) */}
      <MessageActionOverlay
        target={menuTarget}
        isMine={menuTarget?.message.sender_id === myId}
        // Same rule the bubble uses, so its lifted clone keeps the tick and
        // therefore keeps the bubble's exact width.
        seen={
          !!menuTarget &&
          menuTarget.message.sender_id === myId &&
          new Date(menuTarget.message.created_at).getTime() <= otherReadAt
        }
        canCopy={CLIPBOARD_SUPPORTED}
        canEdit={menuTarget ? canEdit(menuTarget.message, myId) : false}
        canDelete={
          !!menuTarget &&
          menuTarget.message.sender_id === myId &&
          !menuTarget.message.deleted_at
        }
        onDismiss={() => setMenuTarget(null)}
        onReply={(m) => setReplyingTo(m)}
        onEdit={(m) => {
          setEditText(m.content ?? "");
          setEditing(m);
        }}
        onDelete={(m) => confirmDelete(m)}
        onCopy={handleCopy}
        onReact={handleToggleReaction}
        currentUserId={myId}
      />

      {/* Conversation actions — an anchored drop-down hanging off the "..."
          button, not a bottom sheet (a sheet threw a full-width surface up
          from the far end of the screen for a small header-level choice). */}
      <AnchoredMenu
        open={!!convMenuAnchor}
        anchor={convMenuAnchor}
        onClose={() => setConvMenuAnchor(null)}
        items={[
          {
            key: "mute",
            label: context?.my_participant.muted ? "Unmute" : "Mute",
            icon: context?.my_participant.muted
              ? "notifications-outline"
              : "notifications-off-outline",
            onPress: () =>
              setState.mutate({
                conversationId,
                muted: !context?.my_participant.muted,
              }),
          },
          {
            key: "archive",
            label: context?.my_participant.archived ? "Unarchive" : "Archive",
            icon: context?.my_participant.archived
              ? "arrow-undo-outline"
              : "archive-outline",
            onPress: () =>
              setState.mutate({
                conversationId,
                archived: !context?.my_participant.archived,
              }),
          },
          ...(otherUserId
            ? [
                {
                  key: "block",
                  label: iBlockedThem ? "Unblock" : "Block",
                  icon: (iBlockedThem
                    ? "person-add-outline"
                    : "hand-left-outline") as IoniconName,
                  onPress: () =>
                    block.mutate({
                      conversationId,
                      blockedUserId: otherUserId,
                      block: !iBlockedThem,
                    }),
                },
              ]
            : []),
          {
            key: "report",
            label: "Report conversation",
            icon: "flag-outline",
            destructive: true,
            onPress: () => setReportOpen(true),
          },
        ]}
      />

      {/* Edit sheet */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit message"
        footer={
          <Button
            title="Save"
            fullWidth
            loading={editMsg.isPending}
            onPress={submitEdit}
          />
        }
      >
        <TextInput
          value={editText}
          onChangeText={setEditText}
          multiline
          autoFocus
          maxLength={MESSAGE_MAX_LENGTH}
          placeholderTextColor={c["muted-foreground"]}
          className="min-h-24 rounded-lg border border-input bg-background p-3 text-[15px] text-foreground"
          style={family.body ? { fontFamily: family.body } : undefined}
        />
      </Sheet>

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="conversation"
        targetId={conversationId}
        label={
          context?.subject.event?.title ??
          context?.subject.place?.name ??
          "Conversation"
        }
      />

      <ImageViewer
        uri={viewerUri}
        open={!!viewerUri}
        onClose={() => setViewerUri(null)}
      />

      <ChatToast message={toast} />
    </View>
  );
}
