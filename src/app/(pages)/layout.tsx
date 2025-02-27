import Header from "@/components/organisms/Header";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <section>
      <Header />
      <main>{children}</main>
    </section>
  );
}
