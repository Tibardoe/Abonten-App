import { getWeeklyTeaser } from "@/actions/weekly/getWeeklyTeaser";
import WeeklyTeaserCard from "../molecules/WeeklyTeaserCard";

// Server-rendered on Explore (already a per-request page): resolves the
// visitor's programme access and the area for the explored location. Renders
// nothing when Abonten Weekly or its teaser is off for them, or when no
// edition is out this week. Never throws into the Explore page.
export default async function WeeklyTeaser({
  lat,
  lng,
}: {
  lat: number | null;
  lng: number | null;
}) {
  const res = await getWeeklyTeaser({
    lat: lat ?? undefined,
    lng: lng ?? undefined,
  });
  if (!res.data) return null;
  return <WeeklyTeaserCard teaser={res.data} />;
}
