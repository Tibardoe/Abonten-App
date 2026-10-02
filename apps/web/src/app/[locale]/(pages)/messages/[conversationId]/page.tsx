import { createClient } from "@/config/supabase/server";
import { MessagingWorkspace } from "@/messaging/components/MessagingWorkspace";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("messaging");
  return { title: t("messages") };
}

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
