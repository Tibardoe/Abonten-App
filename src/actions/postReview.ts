"use server";

import { createClient } from "@/config/supabase/server";

type FormDataType = {
  title: string;
  review: string;
  rating: number;
  reviewedId: string;
};

export async function postReview(formData: FormDataType) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: userDetails, error: userDetailsError } = await supabase
    .from("user_info")
    .select("*")
    .eq("id", user.id)
    .single();

  if (userDetailsError) {
    return {
      status: 500,
      message: `Error fetching user details: ${userDetailsError.message}`,
    };
  }

  if (!userDetails) {
    return { status: 401, message: "User not found" };
  }

  const { title, review, rating, reviewedId } = formData;

  if (reviewedId === user.id) {
    return { status: 400, message: "You cannot review yourself" };
  }

  // Reviews are of organizers — only someone who actually attended one of
  // this person's events may leave one, so a direct call can't be used to
  // review a stranger with no real interaction.
  const { data: reviewedEvents, error: reviewedEventsError } = await supabase
    .from("event")
    .select("id")
    .eq("organizer_id", reviewedId);

  if (reviewedEventsError) {
    return {
      status: 500,
      message: `Error fetching organizer events: ${reviewedEventsError.message}`,
    };
  }

  const reviewedEventIds = (reviewedEvents ?? []).map((event) => event.id);

  let hasAttended = false;

  if (reviewedEventIds.length > 0) {
    const { count } = await supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("event_id", reviewedEventIds);

    hasAttended = (count ?? 0) > 0;
  }

  if (!hasAttended) {
    return {
      status: 403,
      message: "You can only review organizers of events you've attended",
    };
  }

  const formattedTitle = title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  console.log(formattedTitle, review, rating, reviewedId);

  const { error: insertEror } = await supabase.from("review").insert({
    created_at: new Date(),
    title: formattedTitle,
    comment: review,
    rating: rating,
    reviewer_id: userDetails.id,
    reviewed_id: reviewedId,
    status: "approved",
  });

  if (insertEror) {
    console.log(`Error inserting review: ${insertEror.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Review posted successfully!" };
}
