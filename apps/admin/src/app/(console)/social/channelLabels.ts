import type { SocialChannel } from "@abonten/core/social/socialChannels";

// How the console names each channel of the posting queue (English, like the
// rest of the console), and what the person does with the link there.

export const SOCIAL_CHANNEL_LABEL: Record<SocialChannel, string> = {
  ig_story: "Instagram story",
  ig_feed: "Instagram feed",
  x: "X",
  wa_channel: "WhatsApp Channel",
};

export const SOCIAL_CHANNEL_HINT: Record<SocialChannel, string> = {
  ig_story:
    "Post the story picture, add a link sticker with the link, and use the text below as the sticker's words.",
  ig_feed:
    "Post the pictures as one carousel, cover first, with the caption. Instagram captions don't link: put the link in the bio while the post is new.",
  x: "Attach the pictures and paste the caption: the link is in it.",
  wa_channel: "Send the picture with the caption: the links in it open on tap.",
};

/** The caption box's name: on a story it is the link sticker's words. */
export function captionLabel(channel: SocialChannel): string {
  return channel === "ig_story" ? "Sticker words" : "Caption";
}
