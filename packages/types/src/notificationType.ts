// Types for the in-app notification system (Places Phase 2, Milestone 1).
// Manual interface, same style as src/types/placeType.ts — no generated
// Supabase types exist in this repo (see PROJECT.md). Field names/shapes
// here must match supabase/migrations/20260823090000_add_notifications.sql
// + 20260905090000_add_notification_metadata.sql exactly.

// The structured target of a notification — preferred over parsing `link`.
// `kind` drives routing + which thumbnail to show.
export type NotificationEntityKind =
  | "ticket"
  | "event"
  | "place"
  | "event_featured"
  | "place_featured"
  | "review_reply"
  | "profile"
  | "place_claim"
  | "place_booking";

export type NotificationData = {
  kind?: NotificationEntityKind;
  eventId?: string;
  placeId?: string;
  placeSlug?: string;
  ticketId?: string;
  reviewId?: string;
};

export type NotificationType = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: NotificationData;
  image_public_id: string | null;
  image_version: string | null;
  read_at: string | null;
  created_at: string;
};

// Payload accepted by createNotification.ts — user_id/created_at/id are
// assigned by the insert, not the caller.
export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: NotificationData;
  imagePublicId?: string | null;
  imageVersion?: string | null;
};
