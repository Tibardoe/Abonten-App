import type { MessageRow } from "@abonten/api-client";
import { AppText } from "@abonten/ui-native";
import { View } from "react-native";

function systemText(message: MessageRow, isMineInitiator: boolean): string {
  switch (message.system_event) {
    case "conversation_started":
      return isMineInitiator
        ? "You started this conversation"
        : "Conversation started";
    default:
      // Unknown / future system events (member added, closed, reopened…) —
      // show the raw content if the server provided any, else nothing.
      return message.content ?? "";
  }
}

export function SystemMessage({
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
    <View className="items-center px-8 py-1.5">
      <AppText variant="caption" className="text-center">
        {text}
      </AppText>
    </View>
  );
}
