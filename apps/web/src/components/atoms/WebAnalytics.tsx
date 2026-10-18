"use client";

import { pageViewUrl } from "@abonten/core/analytics/pageViewUrl";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

// Vercel Web Analytics: counts page views with no cookies and nothing kept
// in the browser. Every address is cut down before it leaves the page
// (@abonten/core/analytics/pageViewUrl): private pages keep only their first
// segment and links keep only their utm_* tags.
function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = pageViewUrl(event.url);
  return url ? { ...event, url } : null;
}

export default function WebAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
