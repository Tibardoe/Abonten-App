import { useSession } from "@/auth/SessionProvider";
import { ImageViewer } from "@/components/ImageViewer";
import { ReportSheet } from "@/components/ReportSheet";
import { Composer } from "@/components/messaging/Composer";
import { ConversationHeader } from "@/components/messaging/ConversationHeader";
import { DaySeparator } from "@/components/messaging/DaySeparator";
import { MessageBubble } from "@/components/messaging/MessageBubble";
import { SystemMessage } from "@/components/messaging/SystemMessage";
import { TypingIndicator } from "@/components/messaging/TypingIndicator";
import { setActiveConversation } from "@/features/messaging/activeConversation";
import {
  type ChatEntry,
  buildChatEntries,
} from "@/features/messaging/chatEntries";
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
} from "@/features/messaging/useMessagingActions";
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
  Sheet,
  SheetOption,
  Spinner,
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

  const detailQ = useConversationDetail(valid ? conversationId : undefined);
  const messagesQ = useConversationMessages(valid ? conversationId : undefined);
  const { outbox, send, retry, reconcile } = useMessageOutbox(conversationId);

  const markRead = useMarkConversationRead();
  const editMsg = useEditMessage(conversationId);
  const deleteMsg = useDeleteMessage(conversationId);
  const setState = useSetConversationState();
  const block = useBlockParticipant();

  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const [menuTarget, setMenuTarget] = useState<MessageRow | null>(null);
  const [convMenuOpen, setConvMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState<MessageRow | null>(null);
  const [editText, setEditText] = useState("");
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const lastMarkedRef = useRef<string>("");

  const context =
    detailQ.data?.status === 200 ? (detailQ.data.data ?? null) : null;
  const notFound = detailQ.data?.status === 404;

  const serverMessages = flattenMessages(messagesQ.data?.pages);
  const entries = useMemo(
    () => buildChatEntries(serverMessages, outbox, myId),
    [serverMessages, outbox, myId],
  );

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

  const { typingUserIds, sendTyping } = useConversationRealtime(
    valid ? conversationId : undefined,
    { onIncomingMessage: markNewestRead },
  );

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
  const openMessageMenu = useCallback((m: MessageRow) => setMenuTarget(m), []);

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
          onPressImage={setViewerUri}
          onLongPress={openMessageMenu}
          onRetry={retry}
        />
      );
    },
    [myId, otherReadAt, openMessageMenu, retry],
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
            Alert.alert("Couldn't edit", res.message ?? "Please try again.");
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
                Alert.alert(
                  "Couldn't delete",
                  res.message ?? "Please try again.",
                );
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
        onMenu={() => setConvMenuOpen(true)}
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
        ) : messagesQ.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <Spinner />
          </View>
        ) : (
          <FlatList
            data={entries}
            inverted
            keyExtractor={(e) => e.id}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            contentContainerClassName="py-3"
            onEndReached={onEndReached}
            onEndReachedThreshold={0.4}
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
              <View className="flex-1 items-center px-8 pt-16">
                <AppText variant="muted" className="text-center">
                  {messagesQ.isError
                    ? "Couldn't load messages. Pull to retry."
                    : "No messages yet — say hello."}
                </AppText>
              </View>
            }
            renderItem={renderEntry}
          />
        )}

        <Composer
          conversationId={conversationId}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSend={send}
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

      {/* Per-message actions */}
      <Sheet
        open={!!menuTarget}
        onClose={() => setMenuTarget(null)}
        title="Message"
      >
        <View className="gap-2">
          {menuTarget && !menuTarget.deleted_at ? (
            <SheetOption
              icon="arrow-undo-outline"
              title="Reply"
              onPress={() => {
                setReplyingTo(menuTarget);
                setMenuTarget(null);
              }}
            />
          ) : null}
          {menuTarget && canEdit(menuTarget, myId) ? (
            <SheetOption
              icon="create-outline"
              title="Edit"
              onPress={() => {
                setEditText(menuTarget.content ?? "");
                setEditing(menuTarget);
                setMenuTarget(null);
              }}
            />
          ) : null}
          {menuTarget &&
          menuTarget.sender_id === myId &&
          !menuTarget.deleted_at ? (
            <SheetOption
              icon="trash-outline"
              title="Delete"
              onPress={() => {
                const t = menuTarget;
                setMenuTarget(null);
                confirmDelete(t);
              }}
            />
          ) : null}
        </View>
      </Sheet>

      {/* Conversation actions */}
      <Sheet
        open={convMenuOpen}
        onClose={() => setConvMenuOpen(false)}
        title="Conversation"
      >
        <View className="gap-2">
          <SheetOption
            icon={
              context?.my_participant.muted
                ? "notifications-outline"
                : "notifications-off-outline"
            }
            title={context?.my_participant.muted ? "Unmute" : "Mute"}
            onPress={() => {
              setConvMenuOpen(false);
              setState.mutate({
                conversationId,
                muted: !context?.my_participant.muted,
              });
            }}
          />
          <SheetOption
            icon={
              context?.my_participant.archived ? "archive-outline" : "archive"
            }
            title={context?.my_participant.archived ? "Unarchive" : "Archive"}
            onPress={() => {
              setConvMenuOpen(false);
              setState.mutate({
                conversationId,
                archived: !context?.my_participant.archived,
              });
            }}
          />
          {otherUserId ? (
            <SheetOption
              icon={iBlockedThem ? "person-add-outline" : "hand-left-outline"}
              title={iBlockedThem ? "Unblock" : "Block"}
              onPress={() => {
                setConvMenuOpen(false);
                block.mutate({
                  conversationId,
                  blockedUserId: otherUserId,
                  block: !iBlockedThem,
                });
              }}
            />
          ) : null}
          <SheetOption
            icon="flag-outline"
            title="Report conversation"
            onPress={() => {
              setConvMenuOpen(false);
              setReportOpen(true);
            }}
          />
        </View>
      </Sheet>

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
    </View>
  );
}
