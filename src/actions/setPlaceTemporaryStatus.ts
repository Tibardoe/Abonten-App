"use server";

import { createClient } from "@/config/supabase/server";

type TemporaryStatus = "temporarily_closed" | "permanently_closed" | null;

export async function setPlaceTemporaryStatus(
  placeId: string,
  temporaryStatus: TemporaryStatus,
  temporaryStatusNote?: string | null,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: place, error: fetchError } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (fetchError || !place) {
    return { status: 404, message: "Place not found or unauthorized" };
  }

  const { error: updateError } = await supabase
    .from("place")
    .update({
      temporary_status: temporaryStatus,
      // A note without a status is meaningless — clearing the status always
      // clears the note too, so the two fields can't drift out of sync.
      temporary_status_note: temporaryStatus
        ? (temporaryStatusNote ?? null)
        : null,
      updated_at: new Date(),
    })
    .eq("id", placeId)
    .eq("owner_id", user.id);

  if (updateError) {
    return {
      status: 500,
      message: `Error updating place status: ${updateError.message}`,
    };
  }

  return { status: 200, message: "Place status updated successfully!" };
}
