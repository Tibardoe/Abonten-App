import PageHeader from "@/components/molecules/PageHeader";
import ForYouList from "@/discovery/organisms/ForYouList";
import type { Metadata } from "next";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export const metadata: Metadata = {
  title: "For you",
  robots: { index: false },
};

export default function page() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="For you" showBackButton />
      <ForYouList />
    </div>
  );
}
