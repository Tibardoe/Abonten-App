import { addEventToFavorite } from "@/actions/addEventToFavorite";
import { checkIfEventIsFavorited } from "@/actions/checkIfEventIsFavorited";
import { removeEventFromFavorite } from "@/actions/removeEventFromFavorite";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useToast } from "@/hooks/useToast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MdFavorite, MdFavoriteBorder } from "react-icons/md";

type EventProp = {
  eventId: string;
  /** Renders as a DropdownMenuItem (event card menu) instead of a plain button. */
  asMenuItem?: boolean;
};

export default function AddToFavoriteButton({
  eventId,
  asMenuItem,
}: EventProp) {
  const toast = useToast();

  const requireAuth = useRequireAuth();

  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["user-favorited", eventId],
    queryFn: () => checkIfEventIsFavorited(eventId),
    enabled: !!eventId,
    initialData: () => {
      return queryClient.getQueryData<
        Awaited<ReturnType<typeof checkIfEventIsFavorited>>
      >(["user-favorited", eventId]);
    },
  });

  const isFavorite = data?.status === 200 ? data.isFavorited : false;

  const {
    mutate,
    // data: response,
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
      toast.error("Something went wrong. Please try again later.");
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["user-favorited", eventId] });
      // The favorites list page (["favorites"]) is a separate cache entry
      // from this button's own starred/unstarred state above — without this,
      // unfavoriting an event from its card menu on /favorites leaves the
      // card visible until a manual reload.
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const buttonText = isFavorite ? "Remove Favorited" : "Add to Favorite";

  const handleClick = async () => {
    if (await requireAuth()) mutate();
  };

  const icon = isFavorite ? (
    <MdFavorite className="text-xl text-red-500" />
  ) : (
    <MdFavoriteBorder className="text-xl" />
  );

  if (asMenuItem) {
    return (
      <DropdownMenuItem
        onSelect={handleClick}
        disabled={isPending}
        className="gap-2"
      >
        {icon}
        {buttonText}
      </DropdownMenuItem>
    );
  }

  return (
    <button
      type="button"
      className="flex items-center gap-1 p-1"
      onClick={handleClick}
      disabled={isPending}
    >
      {icon}
      {buttonText}
    </button>
  );
}
