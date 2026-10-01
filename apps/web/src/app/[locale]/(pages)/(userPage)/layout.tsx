import SegmentMessages from "@/i18n/SegmentMessages";

// Hands the browser the messages these pages' client components read, on
// top of what every page brings (i18n/SegmentMessages.tsx).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SegmentMessages segment="(userPage)">{children}</SegmentMessages>;
}
