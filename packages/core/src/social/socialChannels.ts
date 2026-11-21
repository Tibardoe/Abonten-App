import type { LinkSource } from "./linkSources";

// The channels Abonten posts its own listings to, read from the posting
// queue in Admin › Social (docs/architecture/social-distribution.md). The
// codes are stored in social_post.channel (and its check constraint): never
// rename one.

export const SOCIAL_CHANNELS = [
  "ig_story",
  "ig_feed",
  "x",
  "wa_channel",
] as const;
export type SocialChannel = (typeof SOCIAL_CHANNELS)[number];

export function isSocialChannel(value: unknown): value is SocialChannel {
  return (SOCIAL_CHANNELS as readonly unknown[]).includes(value);
}

/** The `?src=` code every link handed out for a channel carries. */
export const SOCIAL_CHANNEL_SOURCE: Record<SocialChannel, LinkSource> = {
  ig_story: "ig",
  ig_feed: "ig",
  x: "x",
  wa_channel: "wa",
};

export const SOCIAL_POST_STATUSES = ["pending", "posted", "skipped"] as const;
export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

export function isSocialPostStatus(value: unknown): value is SocialPostStatus {
  return (SOCIAL_POST_STATUSES as readonly unknown[]).includes(value);
}

/** What one channel takes: a 9:16 story image or 4:5 feed images. */
export function socialChannelImageFormat(
  channel: SocialChannel,
): "story" | "post" {
  return channel === "ig_story" ? "story" : "post";
}
