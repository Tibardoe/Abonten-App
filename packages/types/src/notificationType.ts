// Types for the in-app notification system (Places Phase 2, Milestone 1).
// Manual interface, same style as src/types/placeType.ts — no generated
// Supabase types exist in this repo (see PROJECT.md). Field names/shapes
// here must match supabase/migrations/20260823090000_add_notifications.sql
// + 20260903091032_add_notification_metadata.sql exactly.

// The structured target of a notification — preferred over parsing `link`.
// `kind` drives routing + which thumbnail to show.
export type NotificationEntityKind =
  | "ticket"
  | "event"
  | "place"
  | "event_featured"
  | "place_featured"
  | "review_reply"
  | "review_received"
  | "profile"
  | "place_claim"
  | "place_booking"
  | "message"
  | "rewards"
  | "fieldops"
  | "verification"
  | "recommendation";

export type NotificationData = {
  kind?: NotificationEntityKind;
  /** With kind "fieldops": the /field route to open (web + later Expo). */
  fieldOpsRoute?: string;
  /** With kind "verification": which subject's verification screen to open. */
  verificationSubject?: "place" | "organizer";
  eventId?: string;
  placeId?: string;
  placeSlug?: string;
  ticketId?: string;
  /** With kind "ticket" and no ticketId: the Tickets tab section to open. */
  ticketsSection?: "cancelled" | "refunds";
  reviewId?: string;
  conversationId?: string;
  /** With kind "recommendation": the digest this notice announced. */
  digestId?: string;
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
