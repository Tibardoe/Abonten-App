import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth bodies of addPlaceService / updatePlaceService /
// removePlaceService, lifted so the mobile per-place Services routes run the
// same logic. A place_service row has no owner_id of its own, so update /
// remove prove ownership by joining through to the owning place. NOT a
// "use server" file.

export type AddPlaceServiceCoreInput = {
  placeId: string;
  name: string;
  description?: string | null;
  price?: number | null;
  priceUnit?: string | null;
  showPrice: boolean;
};

export type UpdatePlaceServiceCoreInput = {
  serviceId: string;
  name?: string;
  description?: string | null;
  price?: number | null;
  priceUnit?: string | null;
  showPrice?: boolean;
};

export type PlaceServiceCoreResult = {
  status: 200 | 403 | 404 | 500;
  message: string;
  // addPlaceServiceCore echoes the inserted row (web caller uses it).
  data?: Database["public"]["Tables"]["place_service"]["Row"];
};

export async function addPlaceServiceCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: AddPlaceServiceCoreInput,
): Promise<PlaceServiceCoreResult> {
  const { placeId, name, description, price, priceUnit, showPrice } = input;

  const { data: place, error: fetchError } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (fetchError || !place) {
    return { status: 404, message: "Place not found or unauthorized" };
  }

  const { count } = await supabase
    .from("place_service")
    .select("id", { count: "exact", head: true })
    .eq("place_id", placeId);

  const { data: service, error: insertError } = await supabase
    .from("place_service")
    .insert({
      place_id: placeId,
      name,
      description: description ?? null,
      price: price ?? null,
      price_unit: priceUnit ?? null,
      show_price: showPrice,
      position: count ?? 0,
    })
    .select()
    .single();

  if (insertError) {
    return {
      status: 500,
      message: userFacingError("Error adding service", insertError),
    };
  }

  return { status: 200, message: "Service added successfully!", data: service };
}

async function serviceOwnerId(
  supabase: SupabaseClient<Database>,
  serviceId: string,
): Promise<{ found: boolean; ownerId: string | null }> {
  const { data: service, error } = await supabase
    .from("place_service")
    .select("id, place:place_id(owner_id)")
    .eq("id", serviceId)
    .maybeSingle();

  if (error || !service) return { found: false, ownerId: null };

  const ownerId = service.place?.owner_id ?? null;
  return { found: true, ownerId };
}

export async function updatePlaceServiceCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: UpdatePlaceServiceCoreInput,
): Promise<PlaceServiceCoreResult> {
  const { serviceId, name, description, price, priceUnit, showPrice } = input;

  const { found, ownerId } = await serviceOwnerId(supabase, serviceId);
  if (!found) return { status: 404, message: "Service not found" };
  if (ownerId !== userId) {
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
      message: userFacingError("Error updating service", updateError),
    };
  }

  return { status: 200, message: "Service updated successfully!" };
}

export async function removePlaceServiceCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  serviceId: string,
): Promise<PlaceServiceCoreResult> {
  const { found, ownerId } = await serviceOwnerId(supabase, serviceId);
  if (!found) return { status: 404, message: "Service not found" };
  if (ownerId !== userId) {
    return { status: 403, message: "Not authorized to remove this service" };
  }

  const { error: deleteError } = await supabase
    .from("place_service")
    .delete()
    .eq("id", serviceId);

  if (deleteError) {
    return {
      status: 500,
      message: userFacingError("Failed to remove service", deleteError),
    };
  }

  return { status: 200, message: "Service removed successfully!" };
}
