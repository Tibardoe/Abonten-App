"use client";

import { addPlaceToFavorite } from "@/actions/addPlaceToFavorite";
import { checkIfPlaceIsFavorited } from "@/actions/checkIfPlaceIsFavorited";
import { removePlaceFromFavorite } from "@/actions/removePlaceFromFavorite";
import Notification from "@/components/atoms/Notification";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MdFavorite, MdFavoriteBorder } from "react-icons/md";

type PlaceProp = {
  placeId: string;
};

// Mirrors src/components/atoms/AddToFavoriteButton.tsx's optimistic-update
// pattern exactly, for places instead of events.
export default function AddPlaceToFavoriteButton({ placeId }: PlaceProp) {
  const [error, setError] = useState<string | null>(null);

  const requireAuth = useRequireAuth();

  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["place-favorited", placeId],
    queryFn: () => checkIfPlaceIsFavorited(placeId),
    enabled: !!placeId,
    initialData: () => {
      return queryClient.getQueryData<
        Awaited<ReturnType<typeof checkIfPlaceIsFavorited>>
      >(["place-favorited", placeId]);
    },
  });

  const isFavorite = data?.status === 200 ? data.isFavorited : false;

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!placeId) return;

      return isFavorite
        ? await removePlaceFromFavorite(placeId)
        : await addPlaceToFavorite(placeId);
    },

    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: ["place-favorited", placeId],
      });

      const previousState = queryClient.getQueryData<{
        isFavorited: boolean;
        status: number;
      }>(["place-favorited", placeId]);

      queryClient.setQueryData(["place-favorited", placeId], {
        ...previousState,
        isFavorited: !isFavorite,
      });

      return { previousState };
    },

    onError: (_error, _data, context) => {
      queryClient.setQueryData(
        ["place-favorited", placeId],
        context?.previousState,
      );
      setError("Something went wrong. Please try again later.");
    },

    onSettled: () => {
      setTimeout(() => setError(null), 3000);
      queryClient.invalidateQueries({ queryKey: ["place-favorited", placeId] });
      // The favorite-places list page doesn't exist yet (Milestone 7), but
      // this invalidation is future-proofed the same way
      // AddToFavoriteButton.tsx invalidates ["favorites"] for events.
      queryClient.invalidateQueries({ queryKey: ["favorite-places"] });
    },
  });

  const buttonText = isFavorite ? "Remove Favorited" : "Add to Favorite";

  const handleClick = async () => {
    if (await requireAuth()) mutate();
  };

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 p-1"
        onClick={handleClick}
        disabled={isPending}
      >
        {isFavorite ? (
          <MdFavorite className="text-xl text-red-500" />
        ) : (
          <MdFavoriteBorder className="text-xl" />
        )}

        {buttonText}
      </button>

      {error && <Notification notification={error} />}
    </>
  );
}
