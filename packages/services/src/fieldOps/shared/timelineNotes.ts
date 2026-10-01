// The onboarding timeline's own entries.
//
// A timeline row is written once and read by people who may read different
// languages (the member, the team lead, staff), so an entry the system
// writes is stored in one fixed form — the English sentences below — and
// worded for whoever opens the timeline (wordTimelineNote). A note a person
// wrote (a lead's review note) matches none of them and is shown as written.

import { formatDate } from "@abonten/core/i18n/format";
import { requestLocale, tr } from "../../i18n/requestLocale";

export const TIMELINE_NOTE = {
  started: "Started",
  ownerCodeSent: "Owner code sent",
  ownerVerified: "Owner verified their phone",
  claimFiledFor: (placeName: string) => `Claim filed for ${placeName}`,
  /** `day` is the event's start as YYYY-MM-DD. */
  eventListedFor: (day: string) => `Event listed for ${day}`,
} as const;

const CLAIM_FILED = /^Claim filed for (.+)$/;
const EVENT_LISTED = /^Event listed for (.+)$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day of an "Event listed for …" entry, in the reader's language. */
function wordDay(stored: string): string {
  const locale = requestLocale();
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  // Entries written before the day was stored as YYYY-MM-DD hold
  // Date.toDateString() ("Sat Oct 10 2026"), which Date reads back.
  const said = ISO_DAY.test(stored)
    ? formatDate(`${stored}T00:00:00Z`, locale, { ...options, timeZone: "UTC" })
    : formatDate(stored, locale, options);
  return said || stored;
}

/** A stored timeline note in the language of the person reading it. */
export function wordTimelineNote(note: string | null): string | null {
  if (!note) return note;
  if (note === TIMELINE_NOTE.started) return tr("fieldOpsTimeline.started");
  if (note === TIMELINE_NOTE.ownerCodeSent)
    return tr("fieldOpsTimeline.ownerCodeSent");
  if (note === TIMELINE_NOTE.ownerVerified)
    return tr("fieldOpsTimeline.ownerVerified");
  const claim = note.match(CLAIM_FILED);
  if (claim) return tr("fieldOpsTimeline.claimFiledFor", { name: claim[1] });
  const event = note.match(EVENT_LISTED);
  if (event)
    return tr("fieldOpsTimeline.eventListedFor", { date: wordDay(event[1]) });
  return note;
}
