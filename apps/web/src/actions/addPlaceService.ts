"use server";

import { createClient } from "@/config/supabase/server";

type AddPlaceServiceInput = {
  placeId: string;
  name: string;
  description?: string;
  price?: number;
  priceUnit?: string;
  showPrice: boolean;
};

export async function addPlaceService(input: AddPlaceServiceInput) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { placeId, name, description, price, priceUnit, showPrice } = input;

  const { data: place, error: fetchError } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", user.id)
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
      message: `Error adding service: ${insertError.message}`,
    };
  }

  return { status: 200, message: "Service added successfully!", data: service };
}
