// Shared between the Server Component (page.tsx) and the Client Component
// (MyEventsTabs.tsx) — this file has no "use client" directive, since a
// plain helper function exported from a "use client" module can't be
// invoked directly from server code (only rendered/passed as a prop).
export const MY_EVENTS_TAB_VALUES = ["active", "cancelled", "refunds"] as const;
export type MyEventsTab = (typeof MY_EVENTS_TAB_VALUES)[number];

export function isMyEventsTab(value: string | undefined): value is MyEventsTab {
  return !!value && (MY_EVENTS_TAB_VALUES as readonly string[]).includes(value);
}
