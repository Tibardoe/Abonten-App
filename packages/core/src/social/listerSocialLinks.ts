// A lister's own social accounts (docs/architecture/social-distribution.md
// §4): `user_info.social_links` for an organizer, `place.social_links` for a
// place. Both are a flat map network → profile address. Admin › Social reads
// them to credit the lister when Abonten posts their listing ("via @handle"
// on X, a mention or Collab invite on Instagram), so a post reaches the
// lister's followers too.
//
// This is the one rule for what may be stored and how a handle is read back:
//
// - An entry is accepted as an https address on the network's own domains
//   (scheme-less and http:// are read as https://), or as a bare @handle
//   (the @ may be left out). Anything else is refused: another scheme
//   (javascript:, data:, …), another host, a sign-in in the address, a post
//   or a share link instead of a profile.
// - What is stored is always the canonical address built from the handle
//   (https://www.instagram.com/<handle>, https://x.com/<handle>,
//   https://www.tiktok.com/@<handle>, https://www.facebook.com/<name> or
//   …/profile.php?id=<digits>). The database checks the same shapes
//   (public.social_links_valid, migration 20261122100000): change the two
//   together.
// - A handle is only ever read from an address that passes this rule. Place
//   links were never checked when written, so reading them goes through the
//   same parser: nothing that does not parse is shown, linked or credited.
//
// No `URL` object: the app runs this too, and React Native's URL lacks a
// host parser.

export const LISTER_SOCIAL_NETWORKS = [
  "instagram",
  "x",
  "tiktok",
  "facebook",
] as const;

export type ListerSocialNetwork = (typeof LISTER_SOCIAL_NETWORKS)[number];

/** The networks' own names: the same in every language. */
export const LISTER_SOCIAL_NETWORK_NAME: Record<ListerSocialNetwork, string> = {
  instagram: "Instagram",
  x: "X",
  tiktok: "TikTok",
  facebook: "Facebook",
};

/** network → canonical profile address. */
export type ListerSocialLinks = Partial<Record<ListerSocialNetwork, string>>;

export type ListerHandle = {
  network: ListerSocialNetwork;
  /** Without the @. Null for a Facebook profile known only by its number. */
  handle: string | null;
  /** The canonical profile address. */
  url: string;
};

export function isListerSocialNetwork(
  value: unknown,
): value is ListerSocialNetwork {
  return (
    typeof value === "string" &&
    (LISTER_SOCIAL_NETWORKS as readonly string[]).includes(value)
  );
}

/** Longest stored address; the database refuses longer. */
export const LISTER_SOCIAL_LINK_MAX = 200;

const HOSTS: Record<ListerSocialNetwork, readonly string[]> = {
  instagram: ["instagram.com", "www.instagram.com", "m.instagram.com"],
  x: [
    "x.com",
    "www.x.com",
    "mobile.x.com",
    "twitter.com",
    "www.twitter.com",
    "mobile.twitter.com",
  ],
  tiktok: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
  facebook: [
    "facebook.com",
    "www.facebook.com",
    "m.facebook.com",
    "web.facebook.com",
    "mbasic.facebook.com",
    "fb.com",
    "www.fb.com",
  ],
};

const HANDLE: Record<ListerSocialNetwork, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  x: /^[A-Za-z0-9_]{1,15}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
  // A Facebook username: letters, digits and dots, at least five.
  facebook: /^[A-Za-z0-9.]{5,50}$/,
};

/** First path segments that are pages of the network, not a profile. */
const RESERVED: Record<ListerSocialNetwork, readonly string[]> = {
  instagram: [
    "p",
    "reel",
    "reels",
    "tv",
    "stories",
    "explore",
    "accounts",
    "direct",
    "about",
    "legal",
    "developer",
  ],
  x: [
    "home",
    "i",
    "intent",
    "search",
    "explore",
    "settings",
    "share",
    "hashtag",
    "messages",
    "notifications",
    "login",
    "signup",
    "tos",
    "privacy",
  ],
  tiktok: [],
  facebook: [
    "pages",
    "groups",
    "events",
    "watch",
    "marketplace",
    "login",
    "sharer",
    "share",
    "story.php",
    "photo.php",
    "permalink.php",
    "home.php",
    "help",
    "settings",
    "gaming",
    "reel",
  ],
};

function canonical(network: ListerSocialNetwork, handle: string): string {
  switch (network) {
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    case "x":
      return `https://x.com/${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "facebook":
      return `https://www.facebook.com/${handle}`;
  }
}

function facebookById(id: string): ListerHandle | null {
  return /^[0-9]{5,20}$/.test(id)
    ? {
        network: "facebook",
        handle: null,
        url: `https://www.facebook.com/profile.php?id=${id}`,
      }
    : null;
}

function fromHandle(
  network: ListerSocialNetwork,
  handle: string,
): ListerHandle | null {
  if (!HANDLE[network].test(handle)) return null;
  if (RESERVED[network].includes(handle.toLowerCase())) return null;
  // A handle never starts or ends with a dot, nor has two in a row.
  if (/^\.|\.$|\.\./.test(handle)) return null;
  return { network, handle, url: canonical(network, handle) };
}

// scheme? host path? query? fragment? — the whole text, nothing around it.
const ADDRESS =
  /^(?:(https?):\/\/)?([^/?#\s]+)(\/[^?#\s]*)?(\?[^#\s]*)?(#\S*)?$/i;

/**
 * The profile an entry names, or null when it is not one this rule
 * accepts. `raw` is what a person typed or what a row holds.
 */
export function parseListerSocialLink(
  network: ListerSocialNetwork,
  raw: unknown,
): ListerHandle | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > LISTER_SOCIAL_LINK_MAX) return null;
  // Control characters never belong in an address.
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }

  // Any scheme but http(s) is refused before anything else is read.
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(text);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;

  // An address has a scheme, a slash, or starts with one of the network's
  // hosts; anything else is a bare handle, with or without its @.
  const lower = text.toLowerCase();
  const looksLikeAddress =
    scheme !== null ||
    text.includes("/") ||
    HOSTS[network].some(
      (host) =>
        lower.startsWith(host) && /^($|[?#])/.test(lower.slice(host.length)),
    );
  if (!looksLikeAddress) {
    const handle = text.replace(/^@/, "");
    if (handle.includes("@")) return null;
    return fromHandle(network, handle);
  }

  const m = ADDRESS.exec(text);
  if (!m) return null;
  const host = m[2].toLowerCase();
  if (!HOSTS[network].includes(host)) return null;
  const segments = (m[3] ?? "").split("/").filter((s) => s.length > 0);
  const query = m[4] ?? "";

  if (network === "facebook") {
    if (segments.length === 1 && segments[0].toLowerCase() === "profile.php") {
      const id = /[?&]id=([^&]*)/.exec(query)?.[1] ?? "";
      return facebookById(id);
    }
    // facebook.com/people/<Page-Name>/<number>: a page with no username.
    if (segments.length === 3 && segments[0].toLowerCase() === "people") {
      return facebookById(segments[2]);
    }
  }
  if (segments.length !== 1) return null;
  const first = segments[0];
  if (network === "tiktok") {
    return first.startsWith("@") ? fromHandle(network, first.slice(1)) : null;
  }
  if (first.startsWith("@")) return null;
  return fromHandle(network, first);
}

export type ListerSocialLinksResult =
  | { ok: true; links: ListerSocialLinks | null }
  | { ok: false; invalid: string[] };

/**
 * What a profile form sent, checked and made canonical: a map with only the
 * four networks, each a string (empty or null leaves the network out). The
 * whole map replaces what was stored; null when nothing is left. Every
 * entry that is refused is named in `invalid` (an unknown network too).
 */
export function normalizeListerSocialLinks(
  input: unknown,
): ListerSocialLinksResult {
  if (input === null || input === undefined) return { ok: true, links: null };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, invalid: ["*"] };
  }
  const links: ListerSocialLinks = {};
  const invalid: string[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isListerSocialNetwork(key)) {
      invalid.push(key);
      continue;
    }
    if (value === null || value === undefined) continue;
    if (typeof value !== "string") {
      invalid.push(key);
      continue;
    }
    if (value.trim() === "") continue;
    const parsed = parseListerSocialLink(key, value);
    if (!parsed) invalid.push(key);
    else links[key] = parsed.url;
  }
  if (invalid.length > 0) return { ok: false, invalid };
  return { ok: true, links: Object.keys(links).length > 0 ? links : null };
}

/** Older keys a place's links may carry for a network. */
const ALIASES: Record<string, ListerSocialNetwork> = {
  instagram: "instagram",
  ig: "instagram",
  x: "x",
  twitter: "x",
  tiktok: "tiktok",
  facebook: "facebook",
  fb: "facebook",
};

/**
 * The handles a stored map names, in the networks' order, one per network.
 * Reads `user_info.social_links` and `place.social_links` alike; an entry
 * that does not parse is left out, never guessed at.
 */
export function readListerHandles(value: unknown): ListerHandle[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const found = new Map<ListerSocialNetwork, ListerHandle>();
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const network = ALIASES[key.trim().toLowerCase()];
    if (!network || found.has(network)) continue;
    const parsed = parseListerSocialLink(network, raw);
    if (parsed) found.set(network, parsed);
  }
  return LISTER_SOCIAL_NETWORKS.flatMap((n) => {
    const h = found.get(n);
    return h ? [h] : [];
  });
}

/** The stored map as the four form fields ("" where none). */
export function listerSocialLinkFields(
  value: unknown,
): Record<ListerSocialNetwork, string> {
  const fields = { instagram: "", x: "", tiktok: "", facebook: "" };
  for (const h of readListerHandles(value)) fields[h.network] = h.url;
  return fields;
}
