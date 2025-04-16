"use server";

import { createClient } from "@/config/supabase/server";
import type { PostsType } from "@/types/postsType";
import { generateSlug } from "@/utils/geerateSlug";
import { saveEventFlyerToCloudinary } from "./saveEventFlyerToCloudinary";

export async function postEvent(formData: PostsType) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message} `,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const {
    category,
    types,
    title,
    description,
    latitude,
    longitude,
    address,
    website_url,
    price,
    currency,
    capacity,
    selectedFile,
    starts_at,
    ends_at,
  } = formData;

  const flyerUpload = await saveEventFlyerToCloudinary(selectedFile);

  if (!flyerUpload?.public_id || !flyerUpload?.version) {
    return {
      status: 500,
      message: "Flyer upload to Cloudinary failed.",
    };
  }

  const formattedTitle = title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const slug = generateSlug(title);

  const { public_id, version, transformation } = flyerUpload;

  const { error: insertEror } = await supabase.from("event").insert({
    slug: slug,
    title: formattedTitle,
    description: description,
    price: price,
    currency: currency,
    location: `POINT(${longitude} ${latitude})`,
    address: { full_address: address },
    capacity: capacity,
    created_at: new Date(),
    organizer_id: user.user.id,
    website_url: website_url,
    flyer_public_id: public_id,
    flyer_version: version,
    starts_at: starts_at,
    ends_at: ends_at,
    status: "published",
    event_category: category,
    event_type: types,
  });

  if (insertEror) {
    throw insertEror;
  }

  return { status: 200, message: "Event posted successfully!" };
}
