// Admin › Social, the posting queue for Abonten's own channels
// (docs/admin/social.md). What the console shows: everything a person needs
// to post one item by hand, computed when the queue is read.

export type SocialChannelCode = "ig_story" | "ig_feed" | "x" | "wa_channel";
export type SocialPostStatusCode = "pending" | "posted" | "skipped";

export type SocialQueueImage = {
  /** Which share image: a listing's story or post, or a roundup's cover. */
  kind: "events" | "places" | "roundups";
  key: string;
  format: "story" | "post" | "cover";
  /** The image on the website, as anyone (or a posting tool) fetches it. */
  url: string;
  fileName: string;
  /** "Story", "Post", "Cover" or the event's title in a roundup. */
  label: string;
};

export type SocialQueueItem = {
  id: string;
  channel: SocialChannelCode;
  status: SocialPostStatusCode;
  caption: string;
  /** Length as X counts it (links as 23), for X posts only. */
  xLength: number | null;
  /** The tagged link (`?src=`) to put in the post, the sticker or the bio. */
  link: string;
  images: SocialQueueImage[];
  postedAt: string | null;
  /** Who last marked it posted, skipped or back to pending. */
  decidedBy: { id: string; label: string } | null;
  decidedAt: string | null;
  note: string | null;
};

export type SocialQueueSubject = {
  /** event:<id>, place:<id> or roundup:<key>. */
  key: string;
  kind: "event" | "place" | "roundup";
  title: string;
  /** Date and venue, category and area, or the roundup's dates. */
  subtitle: string | null;
  /** The listing in the console, when it is one. */
  adminHref: string | null;
  /** The public page, untagged. */
  publicUrl: string;
  /** Why posting it now may be wrong: ended, no longer public, … */
  warning: string | null;
  items: SocialQueueItem[];
};

export type SocialQueueDay = {
  /** YYYY-MM-DD in the default market's zone. */
  day: string;
  isToday: boolean;
  subjects: SocialQueueSubject[];
};

export type SocialQueueView = {
  today: string;
  days: SocialQueueDay[];
  counts: Record<SocialPostStatusCode, number>;
  /** More rows matched than the page shows. */
  truncated: boolean;
};

export type SocialQueueSettings = {
  enabled: boolean;
  dailyCap: number;
  excludedAccountIds: string[];
  /** Listings published up to here have been looked at. */
  queueWatermark: string;
  updatedAt: string;
  updatedBy: string | null;
};
