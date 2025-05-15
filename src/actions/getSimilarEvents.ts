import { createClient } from "@/config/supabase/server";

export async function getSimilarEvents(
  category: string,
  lng: number,
  lat: number,
  fullAddress: string,
) {
  const supabase = await createClient();

  const { data: similarEvents, error: similarEventsError } = await supabase.rpc(
    "get_similar_events",
    {
      input_category: category,
      input_location: `SRID=4326;POINT(${lng} ${lat})`,
      input_address: fullAddress,
    },
  );

  if (similarEventsError) {
    console.log(similarEventsError.message);

    return {
      status: 500,
      message: `Error fetching similar events: ${similarEventsError.message}`,
    };
  }

  return { status: 200, similarEvents: similarEvents };
}
