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

// Per-user, request-time data (this user's inbox) — same force-dynamic
// precedent as wallet/page.tsx.
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(getSignInUrl("/messages"));

  return <MessagingWorkspace />;
}
