import { WeeklyPage, weeklyMetadata } from "@/weekly/organisms/WeeklyPage";
import { WEEKLY_SCOPE_SLUG_PATTERN } from "@abonten/validation/weeklySchemas";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// This week's edition for an area (for example /weekly/accra). Falls back to
// Ghana-wide picks, clearly labelled, when the area has none this week.
export const revalidate = 60;

// No editions are built ahead of time. Returning an empty list (rather than
// omitting this) is what makes Next.js cache each address on first request and
// refresh it every `revalidate` seconds, instead of rendering every request.
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ scope: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { scope } = await params;
  if (!WEEKLY_SCOPE_SLUG_PATTERN.test(scope)) return {};
  return weeklyMetadata(scope, null);
}

export default async function WeeklyScopePage({ params }: { params: Params }) {
  const { scope } = await params;
  if (!WEEKLY_SCOPE_SLUG_PATTERN.test(scope)) notFound();
  return <WeeklyPage scope={scope} week={null} />;
}
