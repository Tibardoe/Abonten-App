import SegmentMessages from "@/i18n/SegmentMessages";
import type { Metadata } from "next";

// The public identity pages: the hand-back to the app after the provider's
// page, and the stand-in provider (local and Preview only). Never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SegmentMessages segment="identity">{children}</SegmentMessages>;
}
