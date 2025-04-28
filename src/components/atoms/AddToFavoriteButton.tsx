import { addEventToFavorite } from "@/actions/addEventToFavorite";
import { checkIfEventIsFavorited } from "@/actions/checkIfEventIsFavorited";
import { removeEventFromFavorite } from "@/actions/removeEventFromFavorite";
import React, { useEffect, useState } from "react";
import { MdFavorite, MdFavoriteBorder } from "react-icons/md";
import Notification from "./Notification";

type EventProp = {
  eventId?: string;
};

export default function AddToFavoriteButton({ eventId }: EventProp) {
  const [isFavorite, setIsFavorite] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchFavoriteStatus = async () => {
      if (!eventId) return;

      const response = await checkIfEventIsFavorited(eventId);

      if (response.status === 200) {
        setIsFavorite(response.isFavorited); // true or false
      }
    };

    fetchFavoriteStatus();
  }, [eventId]);

  const handleClickedFavorite = async () => {
    if (!eventId) return;

    try {
      setLoading(true);

      const response = isFavorite
        ? await removeEventFromFavorite(eventId)
        : await addEventToFavorite(eventId);

      if (response.status === 200) {
        setIsFavorite(!isFavorite); // flip it!
      } else {
        setError(response.message || "Something went wrong. Please try again.");
      }
    } catch (err) {
      setError("Something went wrong. Please try again later.");
    } finally {
      setLoading(false);
      setTimeout(() => setError(null), 3000); // Clear error after 5 seconds
    }
  };

  const buttonText = loading
    ? "Loading..."
    : isFavorite
      ? "Remove from Favorite"
      : "Add to Favorite";

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 p-1"
        onClick={handleClickedFavorite}
        disabled={loading}
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
