import { createClient } from "@/config/supabase/server";
import { MessagingWorkspace } from "@/messaging/components/MessagingWorkspace";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(getSignInUrl(`/messages/${conversationId}`));

  return <MessagingWorkspace activeId={conversationId} />;
}
