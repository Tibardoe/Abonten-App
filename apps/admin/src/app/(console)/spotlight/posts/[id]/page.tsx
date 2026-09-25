import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadContentPost } from "@/lib/data";
import { formatOpsDateTime } from "@/lib/format";
import Link from "next/link";
import { ContentActions } from "../../../content/ContentActions";
import { SpotlightTabs } from "../../SpotlightTabs";

// One Spotlight or Story as a reviewer sees it: every media item (including
// ones hidden from the public), the attachments, counts and open reports.
export default async function SpotlightPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionPage("spotlight.view");
  const { id } = await params;
  const { ctx, detail } = await loadContentPost(id);

  if (detail.status !== 200 || !detail.data) {
    return (
      <div>
        <PageHeader title="Post" />
        <SpotlightTabs active="/spotlight/posts" />
        <EmptyState>{detail.message ?? "Post not found."}</EmptyState>
      </div>
    );
  }

  const { post, authorName, reportCount } = detail.data;
  const noun = post.kind === "story" ? "Story" : "Spotlight";

  return (
    <div>
      <PageHeader
        title={`${noun} by ${post.publisher.name}`}
        description={`Posted by ${authorName ?? post.authorId} · ${formatOpsDateTime(post.publishedAt)}`}
        actions={
          <ContentActions
            targetType={post.kind}
            targetId={post.id}
            state={post.moderationState}
            permissions={ctx.permissions}
          />
        }
      />
      <SpotlightTabs active="/spotlight/posts" />

      <div className="grid gap-4 md:grid-cols-[280px,1fr]">
        <div className="space-y-2">
          {post.media.map((m) =>
            m.type === "video" ? (
              // biome-ignore lint/a11y/useMediaCaption: user-generated clip under review; there are no captions to show
              <video
                key={m.id}
                src={m.mediaUrl}
                poster={m.posterUrl ?? m.thumbnailUrl ?? undefined}
                controls
                preload="metadata"
                className="aspect-[9/16] w-full rounded-lg bg-black object-contain"
              />
            ) : (
              <img
                key={m.id}
                src={m.mediaUrl}
                alt=""
                className="w-full rounded-lg bg-black object-contain"
              />
            ),
          )}
        </div>

        <div className="space-y-4">
          <Card className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge
                tone={
                  post.moderationState === "visible"
                    ? "success"
                    : post.moderationState === "restricted"
                      ? "warning"
                      : "danger"
                }
              >
                {post.moderationState}
              </Badge>
              <Badge>{post.status}</Badge>
              {reportCount > 0 ? (
                <Link href={`/reports?targetId=${post.id}`}>
                  <Badge tone="warning">{reportCount} reports</Badge>
                </Link>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap">
              {post.caption?.trim() || (
                <span className="text-muted-foreground">No caption</span>
              )}
            </p>
            {post.hashtags.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {post.hashtags.map((h) => `#${h}`).join(" ")}
              </p>
            ) : null}
          </Card>

          <Card className="grid grid-cols-2 gap-2 p-4 text-sm sm:grid-cols-3">
            {(
              [
                ["Views", post.counts.views],
                ["Likes", post.counts.likes],
                ["Reactions", post.counts.reactions],
                ["Comments", post.counts.comments],
                ["Shares", post.counts.shares],
                ["Saves", post.counts.saves],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold tabular-nums">
                  {value.toLocaleString("en-GB")}
                </p>
              </div>
            ))}
          </Card>

          <Card className="space-y-1 p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Publisher: </span>
              {post.publisher.kind} · {post.publisher.name}
            </p>
            <p>
              <span className="text-muted-foreground">Author: </span>
              <Link
                href={`/users/${post.authorId}`}
                className="hover:underline"
              >
                {authorName ?? post.authorId}
              </Link>
            </p>
            {post.event ? (
              <p>
                <span className="text-muted-foreground">Event: </span>
                <Link
                  href={`/events/${post.event.id}`}
                  className="hover:underline"
                >
                  {post.event.title}
                </Link>
              </p>
            ) : null}
            {post.place ? (
              <p>
                <span className="text-muted-foreground">Place: </span>
                <Link
                  href={`/places/${post.place.id}`}
                  className="hover:underline"
                >
                  {post.place.name}
                </Link>
              </p>
            ) : null}
            {post.expiresAt ? (
              <p>
                <span className="text-muted-foreground">Expires: </span>
                {formatOpsDateTime(post.expiresAt)}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">Comments allowed: </span>
              {post.allowComments ? "Yes" : "No"}
              <span className="ml-3 text-muted-foreground">Downloads: </span>
              {post.allowDownload ? "Yes" : "No"}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
