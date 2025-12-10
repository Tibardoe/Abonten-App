import DesktopFooter from "@/components/organisms/DesktopFooter";
import Header from "@/components/organisms/Header";
import MobileNavBar from "@/components/organisms/MobileNavBar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      <main className="w-[95%] mx-auto pt-24 md:pt-28 min-h-dvh">
        {children}
      </main>
      <DesktopFooter />
      <MobileNavBar />
    </>
  );
}
