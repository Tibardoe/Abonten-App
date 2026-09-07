// Which conversation, if any, the user is looking at right now. The chat
// screen sets this on focus and clears it on blur. Phase 7's notification
// handler reads it to suppress an in-app banner for a message in the thread
// that's already on screen. Module-level (not context) so a non-React
// caller — the expo-notifications handler — can read it synchronously.

let activeConversationId: string | null = null;

export function setActiveConversation(conversationId: string | null): void {
  activeConversationId = conversationId;
}

export function getActiveConversation(): string | null {
  return activeConversationId;
}
