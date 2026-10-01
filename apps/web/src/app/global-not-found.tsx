import AppShell from "@/app/AppShell";
import PageNotFound from "@/components/molecules/PageNotFound";
import DesktopFooter from "@/components/organisms/DesktopFooter";
import Header from "@/components/organisms/Header";
import MobileNavBar from "@/components/organisms/MobileNavBar";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

// The 404 for an address that matches no route at all. Next renders it
// outside the [locale] root layout (next.config.ts: experimental
// .globalNotFound), so it brings its own document through AppShell and
// composes the site's chrome by hand: a mistyped or stale link should land
// on a page that still looks and navigates like the rest of the site, in
// the visitor's language (the proxy's cookie), not a bare English document.
// notFound() calls inside pages are handled by app/[locale]/not-found.tsx.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: t("pageTitleWithBrand", { title: t("pageNotFound") }),
    robots: { index: false, follow: false },
  };
}

export default async function GlobalNotFound() {
  const locale = await getLocale();
  return (
    <AppShell locale={locale}>
      <div className="flex flex-col min-h-dvh">
        <Header />
        <main className="w-[95%] mx-auto pt-24 md:pt-28 pb-24 lg:pb-8 flex-1">
          <PageNotFound />
        </main>
        <DesktopFooter />
        <MobileNavBar />
      </div>
    </AppShell>
  );
}
