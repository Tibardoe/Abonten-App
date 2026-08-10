import SettingsProviderWrapper from "@/context/SettingsProviderWrapper";
import SettingsDesktopSideBar from "@/settings/organisms/SettingsDesktopSidebar";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SettingsProviderWrapper>
      <main>
        <section className="hidden lg:grid lg:grid-cols-[auto_1fr] gap-20">
          <SettingsDesktopSideBar />
          {children}
        </section>

        <section className="flex w-full lg:hidden">{children}</section>
      </main>
    </SettingsProviderWrapper>
  );
}
