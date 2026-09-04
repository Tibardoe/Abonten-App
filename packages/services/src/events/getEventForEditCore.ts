import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of getEventForEdit, lifted so the mobile
// GET /api/mobile/organizer/events/:id/edit route prefills its edit form
// from the exact same owner-scoped fetch as the web edit modal.
// Deliberately NOT a "use server" file.

export type EventForEditData = {
  id: string;
  title: string;
  description: string;
  address: { full_address?: string } | null;
  capacity: number | null;
  website_url: string | null;
  event_category: string | null;
  event_type: string[] | string | null;
  require_registration: boolean | null;
  featured: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  flyer_public_id: string;
  flyer_version: string;
  event_occurrence: { id: string; starts_at: string; ends_at: string }[] | null;
  ticket_type:
    | {
        id: string;
        type: string;
        price: number;
        quantity: number | null;
        currency: string | null;
        available_from: string | null;
        available_until: string | null;
      }[]
    | null;
};

export type EventForEditResult =
  | { status: 404; message: string }
  | { status: 200; data: EventForEditData };

export async function getEventForEditCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<EventForEditResult> {
  const { data: event, error } = await supabase
    .from("event")
    .select(
      `
      id,
      title,
      description,
      address,
      capacity,
      website_url,
      event_category,
      event_type,
      require_registration,
      featured,
      starts_at,
      ends_at,
      flyer_public_id,
      flyer_version,
      event_occurrence(id, starts_at, ends_at),
      ticket_type(id, type, price, quantity, currency, available_from, available_until)
    `,
    )
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .single();

  if (error || !event) {
    return { status: 404, message: "Event not found or unauthorized" };
  }

  return { status: 200, data: event as unknown as EventForEditData };
}
