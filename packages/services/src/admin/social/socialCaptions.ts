import type { SocialChannel } from "@abonten/core/social/socialChannels";

// The captions of Admin › Social, the posting queue for Abonten's own
// Instagram, X and WhatsApp Channel (docs/admin/social.md). They are
// Abonten's own posts, written in English like the console that hands them
// out: there is no reader's language to follow. Every fact in them (dates in
// the event's zone, prices in its currency) is formatted before it arrives
// here; this module only lays the facts out per channel and keeps an X post
// under 280.
//
// A listing's posts credit its lister when they have an account on the
// network (docs/architecture/social-distribution.md §4): X ends with
// "via @handle" (a mention, so the lister sees it and can repost it), and
// the Instagram items carry a tip to mention them or send a Collab invite.
// The handle is only ever one read from the lister's own profile
// (@abonten/core/social/listerSocialLinks), never made up.

/** X's limit, and what X counts any link as. */
export const X_MAX_LENGTH = 280;
export const X_LINK_LENGTH = 23;

/**
 * Length of a post as X counts it: a link counts as 23, a character of
 * Latin, Greek, Cyrillic and similar scripts and the common punctuation as 1,
 * anything else (an emoji, the cedi sign, CJK) as 2. An emoji written with a
 * joiner counts every part here, which is more than X counts: never less.
 */
export function xWeightedLength(text: string): number {
  let length = 0;
  const rest = text.replace(/https?:\/\/\S+/g, () => {
    length += X_LINK_LENGTH;
    return "";
  });
  for (const ch of rest) {
    const cp = ch.codePointAt(0) ?? 0;
    const light =
      cp <= 0x10ff ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037);
    length += light ? 1 : 2;
  }
  return length;
}

/** Cut to `max` characters on a word boundary, with an ellipsis. */
export function clampWords(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  const cut = chars.slice(0, Math.max(1, max - 1)).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** "Cape Coast" → "CapeCoast", for a hashtag. */
function tagWord(name: string): string {
  return name.replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Two hashtags for a listing in `city` (or the country when unknown). */
export function listingHashtags(
  kind: "event" | "place",
  city: string | null,
): string[] {
  const where = tagWord(city ?? "") || "Ghana";
  return kind === "event"
    ? [`#${where}Events`, `#ThingsToDoIn${where}`]
    : [`#${where}`, `#ThingsToDoIn${where}`];
}

export type EventCaptionFacts = {
  title: string;
  /** "Sat, 22nd Nov 2026 · 8:00 PM - 11:00 PM", in the event's zone. */
  when: string;
  /** The venue's name, or the short address. */
  venue: string | null;
  /** "Tickets from GH₵50", "Free entry", or null. */
  price: string | null;
  /** What the event offers, for the call to action. */
  offer: "tickets" | "free" | "none";
  city: string | null;
};

export type PlaceCaptionFacts = {
  name: string;
  /** "Restaurant", in English. */
  category: string | null;
  /** "Osu, Accra". */
  area: string | null;
  city: string | null;
};

export type RoundupCaptionEvent = {
  title: string;
  /** "Sat 22 Nov, 8:00 pm", in the event's zone. */
  when: string;
  venue: string | null;
};

export type RoundupCaptionFacts = {
  kind: "week" | "weekend";
  /** "23–29 Nov". */
  dates: string;
  city: string;
  events: RoundupCaptionEvent[];
};

export type CaptionLinks = {
  /** The listing's (or roundup's) page, tagged with the channel's source. */
  link: string;
  /** abontenhub.com/go/app, tagged with the channel's source. */
  appLink: string;
};

/** The lister's accounts a caption may credit (handles without the @). */
export type CaptionCredit = {
  /** The lister's X handle: the X post ends "via @handle". */
  x?: string | null;
};

/** The credit line of an X post, or null without an X handle. */
export function xCreditLine(credit?: CaptionCredit | null): string | null {
  const handle = credit?.x?.replace(/^@+/, "").trim();
  return handle ? `via @${handle}` : null;
}

/**
 * The tip on an Instagram story or feed item when the lister has an
 * Instagram account; null without one.
 */
export function instagramListerTip(
  handle: string | null | undefined,
): string | null {
  const h = handle?.replace(/^@+/, "").trim();
  return h
    ? `Mention @${h} in the Story (or send a Collab invite on a feed post), then ask them to reshare.`
    : null;
}

const CTA: Record<EventCaptionFacts["offer"], string> = {
  tickets: "Get your tickets",
  free: "Reserve your spot",
  none: "See it on Abonten",
};

/** The text of an Instagram story's link sticker. */
const STICKER: Record<EventCaptionFacts["offer"], string> = {
  tickets: "Get tickets",
  free: "Reserve a spot",
  none: "See details",
};

function lines(...parts: (string | null | false | undefined)[]): string {
  return parts
    .filter((p) => p !== null && p !== false && p !== undefined)
    .join("\n");
}

/**
 * The longest version of a post that X accepts: every hashtag, then one,
 * then none, then shorter titles. Whatever `build` always writes (the link,
 * the lister's "via @handle") is kept: hashtags go first, then title words.
 */
function fitForX(
  build: (title: string, tags: string[]) => string,
  title: string,
  tags: string[],
): string {
  for (const t of [tags, tags.slice(0, 1), []]) {
    const text = build(title, t);
    if (xWeightedLength(text) <= X_MAX_LENGTH) return text;
  }
  let short = title;
  let text = build(short, []);
  while (
    xWeightedLength(text) > X_MAX_LENGTH &&
    Array.from(short).length > 20
  ) {
    short = clampWords(short, Array.from(short).length - 10);
    text = build(short, []);
  }
  return text;
}

export function eventCaption(
  channel: SocialChannel,
  facts: EventCaptionFacts,
  links: CaptionLinks,
  credit?: CaptionCredit | null,
): string {
  const tags = listingHashtags("event", facts.city);
  if (channel === "ig_story") return STICKER[facts.offer];
  if (channel === "x") {
    const via = xCreditLine(credit);
    return fitForX(
      (title, t) =>
        lines(
          title,
          "",
          `📅 ${facts.when}`,
          facts.venue && `📍 ${facts.venue}`,
          facts.price && `🎫 ${facts.price}`,
          "",
          via,
          links.link,
          t.length > 0 && t.join(" "),
        ),
      facts.title,
      tags,
    );
  }
  if (channel === "wa_channel") {
    return lines(
      `*${facts.title}*`,
      "",
      `📅 ${facts.when}`,
      facts.venue && `📍 ${facts.venue}`,
      facts.price && `🎫 ${facts.price}`,
      "",
      `${CTA[facts.offer]}: ${links.link}`,
      "",
      `Get the app: ${links.appLink}`,
    );
  }
  // ig_feed: a listing is not posted to the feed on its own, but the
  // caption still reads well if it ever is.
  return lines(
    facts.title,
    "",
    `📅 ${facts.when}`,
    facts.venue && `📍 ${facts.venue}`,
    facts.price && `🎫 ${facts.price}`,
    "",
    `${CTA[facts.offer]} on Abonten: link in bio`,
    "",
    tags.join(" "),
  );
}

export function placeCaption(
  channel: SocialChannel,
  facts: PlaceCaptionFacts,
  links: CaptionLinks,
  credit?: CaptionCredit | null,
): string {
  const tags = listingHashtags("place", facts.city);
  const what = [facts.category, facts.area].filter(Boolean).join(" · ");
  if (channel === "ig_story") return "See it on Abonten";
  if (channel === "x") {
    const via = xCreditLine(credit);
    return fitForX(
      (name, t) =>
        lines(
          `New on Abonten: ${name}`,
          what || null,
          "",
          via,
          links.link,
          t.length > 0 && t.join(" "),
        ),
      facts.name,
      tags,
    );
  }
  if (channel === "wa_channel") {
    return lines(
      `*New on Abonten: ${facts.name}*`,
      what || null,
      "",
      `See what's on and send a booking request: ${links.link}`,
      "",
      `Get the app: ${links.appLink}`,
    );
  }
  return lines(
    `New on Abonten: ${facts.name}`,
    what || null,
    "",
    "See it on Abonten: link in bio",
    "",
    tags.join(" "),
  );
}

function roundupHeading(facts: RoundupCaptionFacts): string {
  return facts.kind === "week"
    ? `What's on in ${facts.city} this week (${facts.dates})`
    : `This weekend in ${facts.city} (${facts.dates})`;
}

export function roundupCaption(
  channel: SocialChannel,
  facts: RoundupCaptionFacts,
  links: CaptionLinks,
): string {
  const tags = listingHashtags("event", facts.city);
  const heading = roundupHeading(facts);
  const full = facts.events.map((e, i) =>
    [`${i + 1}. ${e.title}`, e.when, e.venue].filter(Boolean).join(" · "),
  );

  if (channel === "x") {
    // As many events as fit, each on one short line, then the link.
    const build = (count: number, t: string[]) =>
      lines(
        `${heading} 👇`,
        "",
        ...facts.events
          .slice(0, count)
          .map((e) => `• ${clampWords(e.title, 40)}, ${e.when}`),
        count < facts.events.length && `+ ${facts.events.length - count} more`,
        "",
        links.link,
        t.length > 0 && t.join(" "),
      );
    for (let count = facts.events.length; count >= 1; count--) {
      for (const t of [tags, tags.slice(0, 1), []]) {
        const text = build(count, t);
        if (xWeightedLength(text) <= X_MAX_LENGTH) return text;
      }
    }
    return lines(`${heading} 👇`, "", links.link);
  }
  if (channel === "wa_channel") {
    return lines(
      `*${heading}*`,
      "",
      ...full,
      "",
      `Tickets and details: ${links.link}`,
      "",
      `Get the app: ${links.appLink}`,
    );
  }
  // ig_feed (a carousel: the cover, then the events) and ig_story.
  return lines(
    `${heading} 👇`,
    "",
    ...full,
    "",
    "Tickets and details on Abonten: link in bio",
    "",
    tags.join(" "),
  );
}
