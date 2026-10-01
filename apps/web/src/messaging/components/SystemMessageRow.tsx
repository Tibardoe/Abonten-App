import type { MessageRow } from "@abonten/types/messagingType";
import { useTranslations } from "next-intl";

function systemText(
  message: MessageRow,
  isMineInitiator: boolean,
  t: (key: string) => string,
): string {
  switch (message.system_event) {
    case "conversation_started":
      return isMineInitiator
        ? t("youStartedThisConversation")
        : t("conversationStarted");
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
  const t = useTranslations("messaging");
  const initiatorId =
    (message.system_data?.initiator_id as string | undefined) ?? null;
  const text = systemText(
    message,
    !!currentUserId && initiatorId === currentUserId,
    t,
  );
  if (!text) return null;

  return (
    <div className="flex justify-center px-8 py-1.5">
      <span className="text-center text-xs text-muted-foreground">{text}</span>
    </div>
  );
}
