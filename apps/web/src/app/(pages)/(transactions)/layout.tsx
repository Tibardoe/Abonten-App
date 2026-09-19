import type { Metadata } from "next";

// Personal purchase history: never indexed.
export const metadata: Metadata = {
  title: "Transactions",
  robots: { index: false, follow: false },
};

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      <section className="flex flex-col w-full gap-10">{children}</section>
    </div>
  );
}
