import PageNotFound from "@/components/molecules/PageNotFound";
import DesktopFooter from "@/components/organisms/DesktopFooter";
import Header from "@/components/organisms/Header";
import MobileNavBar from "@/components/organisms/MobileNavBar";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

// Unmatched URLs for the whole site. Next renders this inside the root
// layout only, so the main layout's chrome is composed here by hand: a
// mistyped or stale link should land on a page that still looks and
// navigates like the rest of the site, not a bare document.
export default function RootNotFound() {
  return (
    <div className="flex flex-col min-h-dvh">
      <Header />
      <main className="w-[95%] mx-auto pt-24 md:pt-28 pb-24 md:pb-8 flex-1">
        <PageNotFound />
      </main>
      <DesktopFooter />
      <MobileNavBar />
    </div>
  );
}
