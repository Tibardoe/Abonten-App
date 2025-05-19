import cancelEvent from "@/actions/cancelEvent";
import { useEffect, useState } from "react";
import { MdOutlineCancel } from "react-icons/md";
import Notification from "./Notification";

type CancelProp = {
  eventId: string;
};

export default function CancelButton({ eventId }: CancelProp) {
  const [loading, setLoading] = useState(false);

  const [responseMessage, setResponseMessage] = useState<string | null>(null);

  const handleCancel = async () => {
    setLoading(true);

    const response = await cancelEvent(eventId);

    if (response.status !== 200) {
      setResponseMessage(
        response.mesage ?? "Failed updating event status. Please try again.",
      );

      setLoading(false);
      return;
    }

    setResponseMessage(response.mesage ?? "Event status updated successfully.");
    setLoading(false);
  };

  useEffect(() => {
    if (responseMessage !== null) {
      setTimeout(() => {
        setResponseMessage(null);
      }, 3000);
    }
  }, [responseMessage]);

  return (
    <>
      <button
        onClick={handleCancel}
        disabled={loading}
        type="button"
        className="flex items-center gap-1 p-1 text-red-800 disabled:opacity-50"
      >
        <MdOutlineCancel className="text-xl " />
        {loading ? "Cancelling event..." : "Cancel Event"}
      </button>

      <Notification notification={responseMessage} />
    </>
  );
}
