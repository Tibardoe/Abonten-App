// A tiny in-page signal from the place page's favorite, review and check-in
// controls to the opt-in prompt host, so those components don't need to
// know about prompts. Only the place detail page mounts a listener.

export type PlaceInteraction = {
  placeId: string;
  trigger: "favorite" | "review" | "visit";
};

const EVENT = "abonten:place-interaction";

export function announcePlaceInteraction(detail: PlaceInteraction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PlaceInteraction>(EVENT, { detail }));
}

export function onPlaceInteraction(
  handler: (detail: PlaceInteraction) => void,
): () => void {
  const listener = (e: Event) =>
    handler((e as CustomEvent<PlaceInteraction>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
