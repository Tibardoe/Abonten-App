"use server";

import { createClient } from "@/config/supabase/server";

type UpdatePlaceServiceInput = {
  serviceId: string;
  name?: string;
  description?: string | null;
  price?: number | null;
  priceUnit?: string | null;
  showPrice?: boolean;
};

export async function updatePlaceService(input: UpdatePlaceServiceInput) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { serviceId, name, description, price, priceUnit, showPrice } = input;

  // A place_service row has no owner_id of its own, so ownership is
  // enforced by joining through to the owning place (same pattern as
  // respondToPlaceReview.ts/removePlacePhoto.ts).
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
    return { status: 403, message: "Not authorized to edit this service" };
  }

  const { error: updateError } = await supabase
    .from("place_service")
    .update({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(price !== undefined && { price }),
      ...(priceUnit !== undefined && { price_unit: priceUnit }),
      ...(showPrice !== undefined && { show_price: showPrice }),
    })
    .eq("id", serviceId);

  if (updateError) {
    return {
      status: 500,
      message: `Error updating service: ${updateError.message}`,
    };
  }

  return { status: 200, message: "Service updated successfully!" };
}
