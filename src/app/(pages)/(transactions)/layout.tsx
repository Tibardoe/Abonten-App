import TransactionsFilterLinks from "@/components/molecules/TransactionsFilterLinks";

export default async function layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main>
      <section className="flex flex-col w-full gap-10 min-h-dvh">
        <TransactionsFilterLinks />
        {children}
      </section>
    </main>
  );
}
