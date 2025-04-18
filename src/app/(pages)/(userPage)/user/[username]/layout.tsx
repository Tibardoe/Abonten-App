import ProfileDetails from "@/userAccount/organisms/ProfileDetails";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    username: string; // ← You get this for free
  }>;
};

export default async function layout({ children, params }: LayoutProps) {
  const username = (await params).username;

  return (
    <div className="flex flex-col gap-7">
      <ProfileDetails username={username} />

      <section className="flex flex-col w-full gap-10 min-h-dvh">
        {children}
      </section>
    </div>
  );
}
