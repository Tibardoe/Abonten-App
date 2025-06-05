import { addEventToFavorite } from "@/actions/addEventToFavorite";
import { checkIfEventIsFavorited } from "@/actions/checkIfEventIsFavorited";
import { removeEventFromFavorite } from "@/actions/removeEventFromFavorite";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { MdFavorite, MdFavoriteBorder } from "react-icons/md";
import Notification from "./Notification";

type EventProp = {
  eventId: string;
};

export default function AddToFavoriteButton({ eventId }: EventProp) {
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { isError, data, isLoading } = useQuery({
    queryKey: ["user-favorited", eventId],
    queryFn: () => checkIfEventIsFavorited(eventId),
    enabled: !!eventId,
    initialData: () => {
      return queryClient.getQueryData(["user-favorited", eventId]);
    },
  });

  const isFavorite = data?.status === 200 ? data.isFavorited : false;

  const {
    mutate,
    data: response,
    isPending,
  } = useMutation({
    mutationFn: async () => {
      if (!eventId) return;

      return isFavorite
        ? await removeEventFromFavorite(eventId)
        : await addEventToFavorite(eventId);
    },

    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: ["user-favorited", eventId],
      });

      const previousState = queryClient.getQueryData<{
        isFavorited: boolean;
        status: number;
      }>(["user-favorited", eventId]);

      queryClient.setQueryData(["user-favorited", eventId], {
        ...previousState,
        isFavorited: !isFavorite,
      });

      return { previousState };
    },

    onError: (_error, _data, context) => {
      queryClient.setQueryData(
        ["user-favorited", eventId],
        context?.previousState,
      );
      setError("Something went wrong. Please try again later.");
    },

    onSettled: () => {
      setTimeout(() => setError(null), 3000);
      queryClient.invalidateQueries({ queryKey: ["user-favorited", eventId] });
    },
  });

  const buttonText = isFavorite ? "Remove Favorited" : "Add to Favorite";

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 p-1"
        onClick={() => mutate()}
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
