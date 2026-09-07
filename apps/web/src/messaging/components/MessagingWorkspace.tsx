"use client";

import { cn } from "@/components/lib/utils";
import { useInboxRealtime } from "@/messaging/hooks/useInboxRealtime";
import { MessageSquare } from "lucide-react";
import { ChatThread } from "./ChatThread";
import { ConversationList } from "./ConversationList";

// Responsive two-pane inbox. Desktop: list (fixed width) + thread side by
// side. Mobile: the list OR the thread, depending on whether a conversation
// is selected (the route drives `activeId`).
export function MessagingWorkspace({ activeId }: { activeId?: string }) {
  // Mounted here (not just in the list) so the nav badge + list stay live
  // even while the user is reading a thread.
  useInboxRealtime();

  return (
    <div className="mx-auto flex h-[calc(100dvh-10rem)] max-w-5xl overflow-hidden rounded-xl border bg-background md:h-[calc(100dvh-9rem)]">
      <div
        className={cn(
          "w-full shrink-0 border-r md:w-80",
          activeId && "hidden md:block",
        )}
      >
        <ConversationList activeId={activeId} />
      </div>
      <div className={cn("min-w-0 flex-1", !activeId && "hidden md:block")}>
        {activeId ? (
          <ChatThread key={activeId} conversationId={activeId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            Select a conversation to start reading.
          </div>
        )}
      </div>
    </div>
  );
}
