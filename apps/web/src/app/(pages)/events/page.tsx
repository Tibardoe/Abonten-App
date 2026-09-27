import ExploreAreaChooser from "@/events/organisms/ExploreAreaChooser";
import type { Metadata } from "next";

// Reached only by a typed URL or a stale bookmark (every in-app link carries
// the visitor's location). Thin by design, so it is kept out of the index;
// the location pages are the ones search engines should show. Same area
// chooser as /explore.
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
