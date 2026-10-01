import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Organizer and place-owner management pages: never indexed. Pages under here set their own title where one is more specific.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("manage");
  return {
    // A layout that sets its own title must restate the template, or its
    // pages' titles lose " | Abonten Hub".
    title: { default: t("manage2"), template: "%s | Abonten Hub" },
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
