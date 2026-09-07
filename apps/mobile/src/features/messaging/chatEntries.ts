import type { MessageRow } from "@abonten/api-client";
// Thin mobile-side alias for the shared thread builder. The pure logic
// (day separators, sender grouping, optimistic-row merge) lives in
// @abonten/core/messagingThread so mobile and web stay in lock-step.
import {
  type ChatEntry as CoreChatEntry,
  buildChatEntries as coreBuildChatEntries,
} from "@abonten/core/messagingThread";
import type { OutboxMessage } from "./useMessageOutbox";

export type ChatEntry = CoreChatEntry<OutboxMessage>;

export function buildChatEntries(
  serverNewestFirst: MessageRow[],
  outbox: OutboxMessage[],
  myId: string | undefined,
): ChatEntry[] {
  return coreBuildChatEntries(serverNewestFirst, outbox, myId);
}
