import { getEventShareUrl } from "@/utils/shareUrl";
import AddToFavoriteButton from "../atoms/AddToFavoriteButton";
import CancelButton from "../atoms/CancelButton";
import DeleteEventButton from "../atoms/DeleteEventButton";
import RefundButton from "../atoms/RefundButton";
import RescheduleEventButton from "../atoms/RescheduleEventButton";
import ShareButton from "../atoms/ShareButton";

type EventProp = {
  eventId: string;
  eventTitle: string;
  address: string;
};

export default function EventCardMenuModal({
  eventId,
  eventTitle,
  address,
}: EventProp) {
  const shareUrl = getEventShareUrl(eventTitle, address);

  return (
    <div className="bg-white absolute right-0 rounded-md border shadow-lg p-3 min-w-60 font-bold flex flex-col gap-3 text-gray-700 overflow-y-scroll h-36">
      <AddToFavoriteButton eventId={eventId} />

      <hr />

      <RescheduleEventButton />

      <hr />

      <ShareButton title={eventTitle} url={shareUrl} />

      <hr />

      <RefundButton />

      <hr />

      <CancelButton eventId={eventId} />

      <hr />

      <DeleteEventButton eventId={eventId} />
    </div>
  );
}
