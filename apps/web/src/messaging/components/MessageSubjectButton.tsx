"use client";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
import { useOpenConversation } from "@/messaging/hooks/useOpenConversation";
import type { OpenConversationInput } from "@abonten/types/messagingType";
import { MessageSquare } from "lucide-react";

// "Message organizer" / "Message this place" on a public detail page. Hidden
// for signed-out visitors and for the owner (openConversation would reject
// "you can't message your own …" anyway — this keeps the UI clean). The
// action is a deterministic get-or-create, so it's safe on every click.
export function MessageSubjectButton({
  input,
  ownerId,
  label,
  className,
}: {
  input: OpenConversationInput;
  ownerId?: string | null;
  label: string;
  className?: string;
}) {
  const { data: user } = useCurrentUser();
  const toast = useToast();
  const open = useOpenConversation();

  if (!user) return null;
  if (ownerId && ownerId === user.id) return null;

  return (
    <Button
      variant="outline"
      className={className}
      disabled={open.isPending}
      onClick={() =>
        open.mutate(input, {
          onSuccess: (res) => {
            if (res.status !== 200) {
              toast.error(res.message ?? "Couldn't start a conversation.");
            }
          },
          onError: () => toast.error("Couldn't start a conversation."),
        })
      }
    >
      <MessageSquare className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
