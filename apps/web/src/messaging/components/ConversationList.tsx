"use client";

import { cn } from "@/components/lib/utils";
import {
  useCurrentUser,
  useIsOrganizer,
  useIsPlaceOwner,
} from "@/hooks/useCurrentUser";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import {
  flattenConversations,
  useConversations,
} from "@/messaging/hooks/useConversations";
import type {
  ConversationFilter,
  ConversationRoleScope,
} from "@abonten/types/messagingType";
import { Loader2, MessageSquare } from "lucide-react";
import { useState } from "react";
import { ConversationListRow } from "./ConversationListRow";

const ROLE_LABEL: Record<ConversationRoleScope, string> = {
  all: "All",
  member: "As customer",
  business: "As organizer",
};

export function ConversationList({ activeId }: { activeId?: string }) {
  const { data: user } = useCurrentUser();
  const isOrganizer = useIsOrganizer();
  const isPlaceOwner = useIsPlaceOwner();
  // The customer/organizer split only means anything to someone who runs an
  // event or place; a pure customer just sees the flat list.
  const showRoleScope = isOrganizer || isPlaceOwner;

  const [filter, setFilter] = useState<ConversationFilter>("active");
  const [roleScope, setRoleScope] = useState<ConversationRoleScope>("all");
  const q = useConversations(filter, showRoleScope ? roleScope : "all");
  const rows = flattenConversations(q.data?.pages);

  const sentinelRef = useInfiniteScrollSentinel({
    onIntersect: () => {
      if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
    },
    enabled: !!q.hasNextPage && !q.isFetchingNextPage,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-base font-semibold">Messages</h1>
      </div>
      {showRoleScope ? (
        <div className="flex gap-1 border-b px-2 pt-2">
          {(["all", "member", "business"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleScope(r)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition",
                roleScope === r
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60",
              )}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-1 border-b p-2">
        {(["active", "archived"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {q.isError
                ? "Couldn't load your messages."
                : filter === "archived"
                  ? "No archived conversations."
                  : "No messages yet. Open an event or place and click Message to start one."}
            </p>
            {q.isError ? (
              <button
                type="button"
                onClick={() => q.refetch()}
                className="text-sm font-medium text-primary hover:underline"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {rows.map((item) => (
              <ConversationListRow
                key={item.conversation_id}
                item={item}
                currentUserId={user?.id}
                active={item.conversation_id === activeId}
              />
            ))}
            <div ref={sentinelRef} />
            {q.isFetchingNextPage ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
