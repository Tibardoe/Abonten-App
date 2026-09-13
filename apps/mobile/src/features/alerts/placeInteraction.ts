// A tiny in-app signal from the place screen's favorite, review and check-in
// controls to the opt-in prompt host, so those components don't need to know
// about prompts. Only a mounted place screen listens.

export type PlaceInteraction = {
  placeId: string;
  trigger: "favorite" | "review" | "visit";
};

type Listener = (detail: PlaceInteraction) => void;
const listeners = new Set<Listener>();

export function announcePlaceInteraction(detail: PlaceInteraction): void {
  for (const listener of listeners) listener(detail);
}

export function onPlaceInteraction(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
