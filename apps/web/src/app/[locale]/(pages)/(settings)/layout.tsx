import SegmentMessages from "@/i18n/SegmentMessages";
import SettingsDesktopSideBar from "@/settings/organisms/SettingsDesktopSidebar";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Personal, signed-in pages: never indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return {
    // A layout that sets its own title must restate the template, or its
    // pages' titles lose " | Abonten Hub".
    title: { default: t("settings"), template: "%s | Abonten Hub" },
    robots: { index: false, follow: false },
  };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SegmentMessages segment="(settings)">
      {/* One copy of the page at every width: the side bar is what comes
          and goes. Rendering the page once per breakpoint mounted every
          form twice (two fetches, two inputs with the same id). */}
      <section className="flex w-full lg:grid lg:grid-cols-[auto_1fr] lg:gap-20">
        <div className="hidden lg:block">
          <SettingsDesktopSideBar />
        </div>
        {children}
      </section>
    </SegmentMessages>
  );
}
