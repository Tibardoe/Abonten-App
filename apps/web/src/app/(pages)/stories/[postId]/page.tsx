import StoryLinkLanding from "@/spotlight/organisms/StoryLinkLanding";
import type { Metadata } from "next";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// A shared Story link. Stories are temporary and personal to the viewer's
// access, so nothing about the Story is rendered on the server or put in
// link previews; an ended Story falls back to the publisher's page.
export const metadata: Metadata = {
  title: "Story | Abonten Hub",
  description: "Watch this Story on Abonten Hub.",
  robots: { index: false },
};

export default async function StoryPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <StoryLinkLanding postId={postId} />;
}
