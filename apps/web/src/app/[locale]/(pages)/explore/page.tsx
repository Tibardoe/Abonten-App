import ExploreAreaChooser from "@/events/organisms/ExploreAreaChooser";
import type { Metadata } from "next";

// Reached when a visitor hasn't explored an area yet (the header's Explore
// link comes here until then) or from a typed URL. Thin for search engines,
// so it stays out of the index; the location pages are the ones to show.
export const metadata: Metadata = {
  title: "Explore events and places",
  robots: { index: false, follow: true },
};

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function page() {
  return <ExploreAreaChooser />;
}
