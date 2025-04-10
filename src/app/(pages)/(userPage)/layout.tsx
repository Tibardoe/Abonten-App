import UserAccountTabsNavigation from "@/userAccount/molecules/UserAccountTabsNavigation";
import ProfileDetails from "@/userAccount/organisms/ProfileDetails";

export default async function layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-col gap-7">
      <ProfileDetails />

      <section className="flex flex-col w-full gap-10 min-h-dvh">
        <UserAccountTabsNavigation />

        {children}
      </section>
    </div>
  );
}
