import SegmentMessages from "@/i18n/SegmentMessages";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SegmentMessages segment="(landing)">
      <main>{children}</main>
    </SegmentMessages>
  );
}
