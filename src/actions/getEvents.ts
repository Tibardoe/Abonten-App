// import { createClient } from "@/config/supabase/server";
import { aroundYou } from "@/data/aroundYou";
import { happeningThisMonth } from "@/data/happeningThisMonth";
import { happeningThisWeek } from "@/data/happeningThisWeek";
import { happeningToday } from "@/data/happeningToday";
import { topRatedOrganizers } from "@/data/topRatedOrganizers";

export async function getEvents(urlPath: string) {
  //   const supabase = await createClient();

  switch (urlPath) {
    case "Around You":
      return aroundYou || [];

    case "Top Rated Organizers":
      return topRatedOrganizers || [];

    case "Happening Today":
      return happeningToday || [];

    case "Happening This Week":
      return happeningThisWeek || [];

    case "Happening This Month":
      return happeningThisMonth || [];

    default:
      return [];
  }
}
