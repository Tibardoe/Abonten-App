import SettingsProviderWrapper from "@/context/SettingsProviderWrapper";
import SettingsDesktopSideBar from "@/settings/organisms/SettingsDesktopSidebar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SettingsProviderWrapper>
      <main className="w-[90%] md:w-[80%] mx-auto pt-24 md:pt-32 min-h-dvh mb-20">
        <section className="hidden lg:grid lg:grid-cols-[auto_1fr] gap-20">
          <SettingsDesktopSideBar />
          {children}
        </section>

        <section className="flex w-full lg:hidden">{children}</section>
      </main>
    </SettingsProviderWrapper>
  );
}
