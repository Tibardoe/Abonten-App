import { getLocale, getMessages } from "next-intl/server";
import { MergeMessages } from "./MessageLoader";
import { type RouteSegment, segmentMessages } from "./routeMessages";

// Wraps the pages of one top-level directory of app/[locale] and hands the
// browser the messages their client components read, on top of what every
// page already brings (RootMessages.tsx). Which messages those are is
// worked out by scripts/i18n/gen-route-messages.mjs; `npm run check:i18n`
// fails when a directory's layout does not use this.
export default async function SegmentMessages({
  segment,
  children,
}: {
  segment: RouteSegment;
  children: React.ReactNode;
}) {
  const [locale, all] = await Promise.all([getLocale(), getMessages()]);
  const messages = segmentMessages(segment, locale, all);
  if (Object.keys(messages).length === 0) return children;
  return <MergeMessages messages={messages}>{children}</MergeMessages>;
}
