import type { UserPostType } from "@/types/postsType";
import { getNearByEvents } from "./getNearByEvents";

export async function getFilteredEvents({
  lat,
  lng,
  filter,
  radius = 10, // default to 10km if not provided
}: {
  lat: number;
  lng: number;
  radius?: number;
  filter:
    | "happening-today"
    | "happening-this-week"
    | "happening-this-month"
    | "top-rated-organizers"
    | "category"
    | "around-you";
}) {
  const { data: events, error } = await getNearByEvents(
    lat,
    lng,
    filter === "around-you" ? 5 : radius,
  );

  if (error || !events) return [];

  // Make sure "now" is fresh each time
  const now = new Date();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const oneWeekFromNow = new Date();
  oneWeekFromNow.setDate(now.getDate() + 7);

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  let filtered: UserPostType[] = events;

  switch (filter) {
    case "around-you":
      return filtered; // already filtered by 5km above

    case "happening-today":
      filtered = filtered.filter((event) => {
        if (!event.starts_at) return false;
        const startDate = new Date(event.starts_at);
        return startDate >= todayStart && startDate <= todayEnd;
      });
      break;

    case "happening-this-week":
      filtered = filtered.filter((event) => {
        if (!event.starts_at) return false;
        const startDate = new Date(event.starts_at);
        return startDate >= now && startDate <= oneWeekFromNow;
      });
      break;

    case "happening-this-month":
      filtered = filtered.filter((event) => {
        if (!event.starts_at) return false;
        const startDate = new Date(event.starts_at);
        return startDate >= now && startDate <= endOfMonth;
      });
      break;
  }

  return filtered;
}
