import {
  type PlaceInteraction,
  onPlaceInteraction,
} from "@/features/alerts/placeInteraction";
import { usePromptOffer } from "@/features/alerts/useAlerts";
import { Sheet } from "@abonten/ui-native";
import { useEffect, useState } from "react";
import { RecommendationPromptCard } from "./RecommendationPromptCard";

// "Like this place?" after a favorite, a review or a check-in on this place.
// Opens as a sheet only when the server actually offers something, so most
// interactions show nothing extra.
export function PlacePromptHost({ placeId }: { placeId: string | undefined }) {
  const [interaction, setInteraction] = useState<PlaceInteraction | null>(null);

  useEffect(() => {
    if (!placeId) return;
    return onPlaceInteraction((detail) => {
      if (detail.placeId === placeId) setInteraction(detail);
    });
  }, [placeId]);

  const context =
    interaction && placeId
      ? ({ context: "place", placeId, trigger: interaction.trigger } as const)
      : null;
  const { data: offer } = usePromptOffer(context);
  const open = !!context && !!offer?.place;

  return (
    <Sheet
      open={open}
      onClose={() => setInteraction(null)}
      minHeightRatio={0.3}
    >
      {context ? (
        <RecommendationPromptCard
          context={context}
          onClose={() => setInteraction(null)}
        />
      ) : null}
    </Sheet>
  );
}
