// Where a visitor came from when they followed one of Abonten's own links
// (docs/architecture/social-distribution.md). The links Abonten posts on its
// own channels carry `?src=<code>`; listing pages (website and app) record
// the code with the view, and organizers are told which channel brought
// their views. The codes are short and stable: never translate, rename or
// reuse one, and add a new one here (and nowhere else) when a channel is
// added.
export const LINK_SOURCES = ["ig", "x", "wa", "tt", "fb"] as const;
export type LinkSource = (typeof LINK_SOURCES)[number];

/** The query parameter that carries a link source. */
export const LINK_SOURCE_PARAM = "src";

/** A known source code, or null for anything else (never trusted as is). */
export function normalizeLinkSource(value: unknown): LinkSource | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return (LINK_SOURCES as readonly string[]).includes(v)
    ? (v as LinkSource)
    : null;
}

/** The same address with its source tag set (any other query is kept). */
export function withLinkSource(url: string, source: LinkSource): string {
  const u = new URL(url);
  u.searchParams.set(LINK_SOURCE_PARAM, source);
  return u.toString();
}
