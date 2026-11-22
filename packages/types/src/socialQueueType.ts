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
  /**
   * For an Instagram story or feed post when the lister has an Instagram
   * account: "Mention @handle in the Story (or send a Collab invite on a
   * feed post), then ask them to reshare." Null otherwise.
   */
  listerTip: string | null;
  postedAt: string | null;
  /** Who last marked it posted, skipped or back to pending. */
  decidedBy: { id: string; label: string } | null;
  decidedAt: string | null;
  note: string | null;
};

/** One of the lister's own social accounts, read from their profile. */
export type SocialQueueListerHandle = {
  network: "instagram" | "x" | "tiktok" | "facebook";
  /** Without the @; null for a Facebook profile known only by number. */
  handle: string | null;
  /** The profile's canonical address (never the stored text as typed). */
  url: string;
};

/** Whose accounts a listing credits, and which. */
export type SocialQueueLister = {
  /**
   * organizer: the event's organizer (user_info.social_links).
   * venue: the event's place, because the organizer has none.
   * place: the place itself (place.social_links).
   */
  source: "organizer" | "venue" | "place";
  /** "@username", the organizer's name, or the place's name. */
  name: string | null;
  handles: SocialQueueListerHandle[];
};

/** The frames of a roundup's vertical video (Reel / TikTok). */
export type SocialQueueReel = {
  /** "abonten-week-2026-11-23-reel": the file name, before its extension. */
  fileBase: string;
  /** The cover, then each listed event's Story picture, in order. */
  frames: SocialQueueImage[];
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
  /** An event's or a place's lister and their accounts; null for a roundup. */
  lister: SocialQueueLister | null;
  /** A roundup's video frames; null for a listing. */
  reel: SocialQueueReel | null;
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
