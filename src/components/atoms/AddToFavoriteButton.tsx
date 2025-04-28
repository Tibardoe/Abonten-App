import { addEventToFavorite } from "@/actions/addEventToFavorite";
import { checkIfEventIsFavorited } from "@/actions/checkIfEventIsFavorited";
import { removeEventFromFavorite } from "@/actions/removeEventFromFavorite";
import React, { useEffect, useState } from "react";
import { MdFavorite, MdFavoriteBorder } from "react-icons/md";

type EventProp = {
  eventId?: string;
};

export default function AddToFavoriteButton({ eventId }: EventProp) {
  const [clickedFavorite, setClickedFavorite] = useState(false);

  const [isFavorite, setIsFavorite] = useState(false);

  const [error, setError] = useState("");

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

      let response: { status: number; message?: string };

      if (isFavorite) {
        response = await removeEventFromFavorite(eventId);
      } else {
        response = await addEventToFavorite(eventId);
      }

      if (response.status === 200) {
        setIsFavorite(!isFavorite); // flip it!
      } else {
        setError(response.message || "Something went wrong. Please try again.");
        // Auto-clear error after 5 seconds
        setTimeout(() => setError(""), 5000);
      }
    } catch (err) {
      setError("Something went wrong. Please try again later.");
      setTimeout(() => setError(""), 5000);
    } finally {
      setLoading(false);
    }
  };

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

        {loading
          ? "Loading..."
          : isFavorite
            ? "Remove from Favorite"
            : "Add to Favorite"}
      </button>

      {error && (
        <div className="fixed right-[20%] bottom-10 rounded-md border bg-black bg-opacity-5 p-5 h-40 w-[40%] flex justify-center items-center animate-out">
          Warning: {error}
        </div>
      )}
    </>
  );
}
