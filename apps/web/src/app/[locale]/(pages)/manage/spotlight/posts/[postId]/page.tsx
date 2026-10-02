import { createClient } from "@/config/supabase/server";
import ManagePost from "@/spotlight/organisms/ManagePost";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import { redirect } from "next/navigation";

// One of the creator's own posts: insights, edits, promotion. Per-user.
export const dynamic = "force-dynamic";

export default async function ManageSpotlightPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(getSignInUrl(`/manage/spotlight/posts/${postId}`));
  return <ManagePost postId={postId} />;
}
