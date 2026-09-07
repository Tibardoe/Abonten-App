import type { MessageRow } from "@abonten/types/messagingType";

function systemText(message: MessageRow, isMineInitiator: boolean): string {
  switch (message.system_event) {
    case "conversation_started":
      return isMineInitiator
        ? "You started this conversation"
        : "Conversation started";
    default:
      return message.content ?? "";
  }
}

export function SystemMessageRow({
  message,
  currentUserId,
}: {
  message: MessageRow;
  currentUserId: string | undefined;
}) {
  const initiatorId =
    (message.system_data?.initiator_id as string | undefined) ?? null;
  const text = systemText(
    message,
    !!currentUserId && initiatorId === currentUserId,
  );
  if (!text) return null;

  return (
    <div className="flex justify-center px-8 py-1.5">
      <span className="text-center text-xs text-muted-foreground">{text}</span>
    </div>
  );
}
