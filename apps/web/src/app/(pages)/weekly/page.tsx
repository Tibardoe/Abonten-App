import { WeeklyPage, weeklyMetadata } from "@/weekly/organisms/WeeklyPage";
import type { Metadata } from "next";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// Abonten Weekly, this week, Ghana-wide. The same for every visitor, so it is
// cached and refreshed every minute (like event and place pages); a listing
// cancelled or hidden after publication drops out on the next refresh.
export const revalidate = 60;

export function generateMetadata(): Promise<Metadata> {
  return weeklyMetadata(null, null);
}

export default function WeeklyCurrentPage() {
  return <WeeklyPage scope={null} week={null} />;
}
