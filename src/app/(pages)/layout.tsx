import DesktopFooter from "@/components/organisms/DesktopFooter";
import Header from "@/components/organisms/Header";
import MobileNavBar from "@/components/organisms/MobileNavBar";
import UIProvider from "@/context/UICOntextProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <UIProvider>
      <Header />
      <main className="h-dvh">{children}</main>
      <DesktopFooter />
      <MobileNavBar />
    </UIProvider>
  );
}
