"use server";

import { createClient } from "@/config/supabase/server";

export async function saveToSupabase(
  publicId: string,
  version: number,
  transformation: string,
) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { error: updateError } = await supabase
    .from("user_info")
    .update({ avatar_public_id: publicId, avatar_version: version })
    .eq("id", user.user.id);

  if (updateError) {
    throw updateError;
  }

  const { error: insertEror } = await supabase
    .from("user_image_history")
    .insert({
      user_id: user.user.id,
      public_id: publicId,
      version: version,
      transformation: transformation,
    })
    .eq("user_id", user.user.id);

  if (insertEror) {
    throw insertEror;
  }

  return { status: 200, message: "User profile updated successfully!" };
}
