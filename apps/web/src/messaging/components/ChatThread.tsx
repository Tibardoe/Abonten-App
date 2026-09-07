"use client";

import { cn } from "@/components/lib/utils";
import { ReportDialog } from "@/components/organisms/ReportDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import { useToast } from "@/hooks/useToast";
import {
  flattenMessages,
  useConversationDetail,
  useConversationMessages,
} from "@/messaging/hooks/useConversation";
import { useConversationRealtime } from "@/messaging/hooks/useConversationRealtime";
import { useMessageOutbox } from "@/messaging/hooks/useMessageOutbox";
import {
  useBlockParticipant,
  useDeleteMessage,
  useEditMessage,
  useMarkConversationRead,
  useSetConversationState,
} from "@/messaging/hooks/useMessagingActions";
import { buildChatEntries } from "@abonten/core/messagingThread";
import {
  MESSAGE_EDIT_WINDOW_MINUTES,
  type MessageRow,
} from "@abonten/types/messagingType";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Calendar,
  Flag,
  LifeBuoy,
  Loader2,
  MoreVertical,
  Store,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./Composer";
import { DaySeparatorRow } from "./DaySeparatorRow";
import { EditMessageDialog } from "./EditMessageDialog";
import { MessageBubble } from "./MessageBubble";
import { SystemMessageRow } from "./SystemMessageRow";
import { TypingDots } from "./TypingDots";

function canEditMessage(m: MessageRow, myId: string | undefined): boolean {
  if (!myId || m.sender_id !== myId) return false;
  if (m.message_type !== "text" || m.deleted_at) return false;
  const ageMin = (Date.now() - new Date(m.created_at).getTime()) / 60_000;
  return ageMin <= MESSAGE_EDIT_WINDOW_MINUTES;
}

export function ChatThread({ conversationId }: { conversationId: string }) {
  const { data: user } = useCurrentUser();
  const myId = user?.id;
  const toast = useToast();

  const detailQ = useConversationDetail(conversationId);
  const messagesQ = useConversationMessages(conversationId);
  const { outbox, send, retry, reconcile } = useMessageOutbox(conversationId);

  const markRead = useMarkConversationRead();
  const editMsg = useEditMessage(conversationId);
  const deleteMsg = useDeleteMessage(conversationId);
  const setState = useSetConversationState();
  const block = useBlockParticipant();

  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const [editing, setEditing] = useState<MessageRow | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const lastMarkedRef = useRef("");

  const context =
    detailQ.data?.status === 200 ? (detailQ.data.data ?? null) : null;
  const notFound = detailQ.data?.status === 404;

  const serverMessages = flattenMessages(messagesQ.data?.pages);
  const entries = useMemo(
    () => buildChatEntries(serverMessages, outbox, myId),
    [serverMessages, outbox, myId],
  );

  useEffect(() => {
    const confirmed = new Set(
      serverMessages
        .map((m) => m.client_generated_id)
        .filter((v): v is string => !!v),
    );
    reconcile(confirmed);
  }, [serverMessages, reconcile]);

  const otherParticipant = context?.participants.find(
    (p) => p.user_id !== myId,
  );
  const otherReadAt = otherParticipant
    ? new Date(otherParticipant.last_read_at).getTime()
    : 0;
  const otherUserId = otherParticipant?.user_id;
  const iBlockedThem =
    !!otherUserId && (context?.blocked_user_ids ?? []).includes(otherUserId);
  const closed = context?.status === "closed";

  const markNewestRead = useCallback(() => {
    const newest = serverMessages[0];
    if (!newest || newest.created_at === lastMarkedRef.current) return;
    lastMarkedRef.current = newest.created_at;
    markRead.mutate({ conversationId, upTo: newest.created_at });
  }, [serverMessages, conversationId, markRead]);

  const { typingUserIds, sendTyping } = useConversationRealtime(
    conversationId,
    {
      onIncomingMessage: markNewestRead,
    },
  );

  useEffect(() => {
    markNewestRead();
  }, [markNewestRead]);

  const sentinelRef = useInfiniteScrollSentinel({
    onIntersect: () => {
      if (messagesQ.hasNextPage && !messagesQ.isFetchingNextPage) {
        messagesQ.fetchNextPage();
      }
    },
    enabled: !!messagesQ.hasNextPage && !messagesQ.isFetchingNextPage,
  });

  function submitEdit(content: string) {
    if (!editing || !content || content === editing.content) {
      setEditing(null);
      return;
    }
    editMsg.mutate(
      { messageId: editing.id, content },
      {
        onSettled: (res) => {
          if (res && res.status !== 200) {
            toast.error(res.message ?? "Couldn't edit that message.");
          }
          setEditing(null);
        },
      },
    );
  }

  function onDelete(m: MessageRow) {
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    deleteMsg.mutate(m.id, {
      onSettled: (res) => {
        if (res && res.status !== 200) {
          toast.error(res.message ?? "Couldn't delete that message.");
        }
      },
    });
  }

  const subjectName =
    context?.subject.event?.title ??
    context?.subject.place?.name ??
    context?.title ??
    "Conversation";
  const SubjectIcon =
    context?.type === "place"
      ? Store
      : context?.type === "support"
        ? LifeBuoy
        : Calendar;
  const subjectHref = context?.subject.event
    ? `/events/${context.subject.event.event_code}`
    : context?.subject.place
      ? `/places/${context.subject.place.slug}`
      : null;

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <Ban className="h-6 w-6" />
        This conversation isn&apos;t available.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Link
          href="/messages"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent md:hidden"
          aria-label="Back to messages"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SubjectIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {subjectHref ? (
            <Link
              href={subjectHref}
              className="block truncate text-sm font-semibold hover:underline"
            >
              {subjectName}
            </Link>
          ) : (
            <span className="block truncate text-sm font-semibold">
              {subjectName}
            </span>
          )}
          <span className="block text-[11px] text-muted-foreground">
            {context?.type === "event"
              ? "Event"
              : context?.type === "place"
                ? "Place"
                : context?.type === "support"
                  ? "Support"
                  : ""}
            {closed ? " · Closed" : ""}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Conversation options"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onSelect={() =>
                setState.mutate({
                  conversationId,
                  muted: !context?.my_participant.muted,
                })
              }
            >
              {context?.my_participant.muted ? (
                <Bell className="mr-2 h-4 w-4" />
              ) : (
                <BellOff className="mr-2 h-4 w-4" />
              )}
              {context?.my_participant.muted ? "Unmute" : "Mute"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                setState.mutate({
                  conversationId,
                  archived: !context?.my_participant.archived,
                })
              }
            >
              {context?.my_participant.archived ? (
                <ArchiveRestore className="mr-2 h-4 w-4" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              {context?.my_participant.archived ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
            {otherUserId ? (
              <DropdownMenuItem
                onSelect={() =>
                  block.mutate({
                    conversationId,
                    blockedUserId: otherUserId,
                    block: !iBlockedThem,
                  })
                }
              >
                {iBlockedThem ? (
                  <UserPlus className="mr-2 h-4 w-4" />
                ) : (
                  <Ban className="mr-2 h-4 w-4" />
                )}
                {iBlockedThem ? "Unblock" : "Block"}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setReportOpen(true)}>
              <Flag className="mr-2 h-4 w-4" />
              Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      {messagesQ.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto py-3">
          {typingUserIds.length > 0 ? <TypingDots /> : null}
          {entries.map((entry) => {
            if (entry.kind === "day") {
              return <DaySeparatorRow key={entry.id} label={entry.label} />;
            }
            if (entry.message.message_type === "system") {
              return (
                <SystemMessageRow
                  key={entry.id}
                  message={entry.message}
                  currentUserId={myId}
                />
              );
            }
            const seen =
              entry.isMine &&
              !entry.pending &&
              new Date(entry.message.created_at).getTime() <= otherReadAt;
            return (
              <MessageBubble
                key={entry.id}
                message={entry.message}
                pending={entry.pending}
                isMine={entry.isMine}
                seen={seen}
                canEdit={canEditMessage(entry.message, myId)}
                onReply={setReplyingTo}
                onEdit={setEditing}
                onDelete={onDelete}
                onRetry={(cid) => {
                  if (outbox.some((o) => o.clientGeneratedId === cid))
                    retry(cid);
                }}
              />
            );
          })}
          {entries.length === 0 ? (
            <p className="px-8 py-16 text-center text-sm text-muted-foreground">
              {messagesQ.isError
                ? "Couldn't load messages."
                : "No messages yet — say hello."}
            </p>
          ) : null}
          {messagesQ.isFetchingNextPage ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          <div ref={sentinelRef} />
        </div>
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

      <EditMessageDialog
        message={editing}
        onClose={() => setEditing(null)}
        onSave={submitEdit}
        saving={editMsg.isPending}
      />

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType="conversation"
        targetId={conversationId}
        targetLabel={subjectName}
      />
    </div>
  );
}
