import { deleteEvent } from "@/actions/deleteEvent";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Notification from "../atoms/Notification";

type DeletePopupProp = {
  handleShowDeletePopup: (state: boolean) => void;
  message: string;
  eventId: string;
};

export default function DeletePopupModal({
  handleShowDeletePopup,
  message,
  eventId,
}: DeletePopupProp) {
  const [success, setSuccess] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleDeleteEvent = async () => {
    if (!eventId) return;

    try {
      setLoading(true);

      const response = await deleteEvent(eventId);

      if (response.status === 200) {
        setSuccess(response.message);
        setTimeout(() => {
          router.refresh(); // This will reload the page
        }, 1000); // Optional delay before refreshing
      } else {
        setError(response.message || "Something went wrong.");
      }
    } catch (error) {
      setError("Something went wrong. Please try again later.");
      console.log(error);
    } finally {
      setLoading(false);
      setTimeout(() => setError(null), 3000); // Clear error after 5 seconds
    }
  };
  return (
    <>
      <div className="fixed top-0 left-0 w-full h-dvh bg-black bg-opacity-50 flex justify-center items-center z-30">
        <div className="w-[70%] md:w-[40%] p-3 bg-white rounded-xl">
          <h1 className="text-lg font-bold text-center pb-3">Warning</h1>

          <hr />

          <div className="space-y-2 md:space-y-4">
            <p className="text-red-700 text-center py-3"> {message}</p>

            <hr />

            <div className="flex gap-3 justify-center">
              <button
                type="button"
                className="rounded-md border border-black px-5 py-2"
                onClick={handleDeleteEvent}
                disabled={loading}
              >
                {loading ? "Deleting" : "Yes"}
              </button>
              <button
                type="button"
                className="rounded-md bg-black text-white px-5 py-2"
                onClick={() => handleShowDeletePopup(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {success && <Notification notification={success} />}
      {error && <Notification notification={error} />}
    </>
  );
}
