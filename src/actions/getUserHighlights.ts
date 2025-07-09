"use server";

import { createClient } from "@/config/supabase/server";

export default async function getUserHighlight(username: string) {
  const supabase = await createClient();

  const { data: userId, error: userIdError } = await supabase
    .from("user_info")
    .select("id")
    .eq("username", username)
    .single();

  if (!userId || userIdError) {
    console.log(`Error fetching user id: ${userIdError?.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  const { data: highlights, error: highlightsError } = await supabase
    .from("highlight")
    .select("*")
    .eq("user_id", userId.id);

  if (highlightsError) {
    console.log(`Error fetching highlights: ${highlightsError.message}`);
    return { status: 500, message: "Something went wrong! Try again later" };
  }

  // Group by group_id
  const grouped = highlights.reduce<Record<string, typeof highlights>>(
    (acc, highlight) => {
      const groupId = highlight.group_id;
      if (!acc[groupId]) acc[groupId] = [];
      acc[groupId].push(highlight);
      return acc;
    },
    {},
  );

  // Return grouped highlights as an array of groups
  const groupedHighlights = Object.values(grouped);

  return {
    status: 200,
    data: groupedHighlights,
  };
}
