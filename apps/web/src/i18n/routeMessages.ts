import {
  type MessageSelection,
  type Messages,
  pickMessages,
} from "@abonten/core/i18n/pickMessages";
import data from "./routeMessages.generated.json";

// The messages each part of the site reads in the browser, as worked out
// by scripts/i18n/gen-route-messages.mjs. SERVER ONLY: the key lists are
// large and the browser has no use for them (it is sent the messages
// themselves). Browser code reads i18n/lazyNamespaces.generated.json.

export type RouteSegment = keyof typeof data.segments;

const ROOT = data.root as MessageSelection;
const SEGMENTS = data.segments as Record<RouteSegment, MessageSelection>;

// One language's catalogs are cut the same way for every request, so each
// cut is made once per server instance. Not in development, where the
// catalogs change under a running server.
const cuts = new Map<string, Messages>();

function cut(
  name: string,
  locale: string,
  all: Messages,
  selection: MessageSelection,
): Messages {
  if (process.env.NODE_ENV !== "production") {
    return pickMessages(all, selection);
  }
  const id = `${locale}:${name}`;
  let made = cuts.get(id);
  if (!made) {
    made = pickMessages(all, selection);
    cuts.set(id, made);
  }
  return made;
}

/** What every page brings: the document shell and the site chrome. */
export function rootMessages(locale: string, all: Messages): Messages {
  return cut("root", locale, all, ROOT);
}

/** What the pages of one top-level directory add to that. */
export function segmentMessages(
  segment: RouteSegment,
  locale: string,
  all: Messages,
): Messages {
  return cut(`segment:${segment}`, locale, all, SEGMENTS[segment]);
}
