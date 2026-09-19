import SpotlightSingle from "@/spotlight/organisms/SpotlightSingle";
import type { Metadata } from "next";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// A shared Spotlight link. The post loads on the client for this visitor, so
// the programme switch, blocks and moderation always apply. Metadata stays
// generic on purpose: link previews must not leak a post that is hidden,
// removed or not yet available to everyone.
export const metadata: Metadata = {
  title: "Spotlight",
  description: "Watch this Spotlight on Abonten Hub.",
  robots: { index: false },
};

export default async function SpotlightPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <SpotlightSingle postId={postId} />;
}
