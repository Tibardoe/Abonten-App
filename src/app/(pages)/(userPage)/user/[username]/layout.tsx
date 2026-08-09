import ProfileDetails from "@/userAccount/organisms/ProfileDetails";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    username: string; // ← You get this for free
  }>;
};

export default async function layout({ children, params }: LayoutProps) {
  const username = (await params).username;

  return (
    <div className="flex flex-col gap-5">
      <ProfileDetails username={username} />

      <section className="flex flex-col w-full gap-10 min-h-dvh">
        {children}
      </section>
    </div>
  );
}
