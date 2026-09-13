import { WeeklyPage, weeklyMetadata } from "@/weekly/organisms/WeeklyPage";
import { isWeekStart } from "@abonten/core/weekly/week";
import { WEEKLY_SCOPE_SLUG_PATTERN } from "@abonten/validation/weeklySchemas";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// One dated edition, for example /weekly/accra/2026-09-14. This is the
// address people share and the canonical URL of an edition.
export const revalidate = 60;

type Params = Promise<{ scope: string; week: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { scope, week } = await params;
  if (!WEEKLY_SCOPE_SLUG_PATTERN.test(scope) || !isWeekStart(week)) return {};
  return weeklyMetadata(scope, week);
}

export default async function WeeklyEditionPage({
  params,
}: {
  params: Params;
}) {
  const { scope, week } = await params;
  if (!WEEKLY_SCOPE_SLUG_PATTERN.test(scope) || !isWeekStart(week)) notFound();
  return <WeeklyPage scope={scope} week={week} />;
}
