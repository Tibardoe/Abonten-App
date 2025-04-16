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

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user.user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: userDetails, error: userDetailsError } = await supabase
    .from("user_info")
    .select("*")
    .eq("id", user.user.id)
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

  const formattedTitle = title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  console.log(title, review, rating, reviewedId);

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
    throw insertEror;
  }

  return { status: 200, message: "Review posted successfully!" };
}
