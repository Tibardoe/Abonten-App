import SegmentMessages from "@/i18n/SegmentMessages";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// A contact's live alert page. Private to whoever holds the link: never
// indexed, never followed, and the address is not passed on to any site
// opened from it.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("safety");
  return {
    title: { default: t("title"), template: "%s | Abonten Hub" },
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SegmentMessages segment="sos">{children}</SegmentMessages>;
}
