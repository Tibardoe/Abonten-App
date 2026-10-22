import SegmentMessages from "@/i18n/SegmentMessages";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// A trusted-contact invite: private to whoever holds the link, never indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("safety");
  return {
    title: { default: t("invitePageTitle"), template: "%s | Abonten Hub" },
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SegmentMessages segment="trusted">{children}</SegmentMessages>;
}
