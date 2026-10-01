import { createClient } from "@/config/supabase/server";
import CreatorHub from "@/spotlight/organisms/CreatorHub";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Spotlight and Stories" };

// Per-user creator tools, request-time only.
export const dynamic = "force-dynamic";

export default async function ManageSpotlightPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(getSignInUrl("/manage/spotlight"));

  return (
    <Suspense fallback={null}>
      <CreatorHub />
    </Suspense>
  );
}
