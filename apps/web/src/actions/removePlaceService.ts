"use server";

import { createClient } from "@/config/supabase/server";

export async function removePlaceService(serviceId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: service, error: fetchError } = await supabase
    .from("place_service")
    .select("id, place:place_id(owner_id)")
    .eq("id", serviceId)
    .maybeSingle();

  if (fetchError || !service) {
    return { status: 404, message: "Service not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST's embedded-resource shape isn't worth a dedicated type for this one ownership check; no generated Supabase types exist in this repo (see PROJECT.md)
  const ownerId = (service as any).place?.owner_id;

  if (ownerId !== user.id) {
    return { status: 403, message: "Not authorized to remove this service" };
  }

  const { error: deleteError } = await supabase
    .from("place_service")
    .delete()
    .eq("id", serviceId);

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to remove service: ${deleteError.message}`,
    };
  }

  return { status: 200, message: "Service removed successfully!" };
}
