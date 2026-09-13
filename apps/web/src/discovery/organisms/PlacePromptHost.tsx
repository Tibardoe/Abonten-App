"use client";

import {
  type PlaceInteraction,
  onPlaceInteraction,
} from "@/discovery/placeInteraction";
import { useDiscoveryProgram } from "@/hooks/useDiscoveryProgram";
import { useEffect, useState } from "react";
import RecommendationPromptCard from "./RecommendationPromptCard";

// Shows "Like this place?" after someone favorites, reviews or checks in at
// this place (the server decides whether a prompt may appear). A floating
// card near the bottom of the screen that never covers the control the
// person just used and closes on "Not now".
export default function PlacePromptHost({ placeId }: { placeId: string }) {
  const { program } = useDiscoveryProgram();
  const [interaction, setInteraction] = useState<PlaceInteraction | null>(null);

  useEffect(
    () =>
      onPlaceInteraction((detail) => {
        if (detail.placeId === placeId) setInteraction(detail);
      }),
    [placeId],
  );

  if (!program.prompts || !interaction) return null;

  return (
    <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md md:bottom-6">
      <RecommendationPromptCard
        key={interaction.trigger}
        context={{ context: "place", placeId, trigger: interaction.trigger }}
        className="shadow-xl"
        onClose={() => setInteraction(null)}
      />
    </div>
  );
}
