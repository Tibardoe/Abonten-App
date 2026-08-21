// Types for the in-app notification system (Places Phase 2, Milestone 1).
// Manual interface, same style as src/types/placeType.ts — no generated
// Supabase types exist in this repo (see PROJECT.md). Field names/shapes
// here must match supabase/migrations/20260823090000_add_notifications.sql
// exactly.

export type NotificationType = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
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
};
