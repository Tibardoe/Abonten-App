import { supabase } from "@/config/supabase/client";
import { getEventShareUrl } from "@/utils/shareUrl";
import { useQuery } from "@tanstack/react-query";
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
  organizerId?: string;
};

export default function EventCardMenuModal({
  eventId,
  eventTitle,
  address,
  organizerId,
}: EventProp) {
  const shareUrl = getEventShareUrl(eventTitle, address);

  const { data: userData } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      return user;
    },
  });

  const isOrganizer = userData?.id === organizerId;

  return (
    <div className="bg-white absolute right-0 rounded-md border shadow-lg p-3 min-w-60 font-bold flex flex-col gap-3 text-gray-700 overflow-y-scroll h-36">
      <AddToFavoriteButton eventId={eventId} />

      <hr />

      <ShareButton title={eventTitle} url={shareUrl} />

      <hr />

      <RefundButton />

      <hr />

      {isOrganizer && (
        <>
          <RescheduleEventButton />
          <hr />
          <CancelButton eventId={eventId} />
          <hr />
          <DeleteEventButton eventId={eventId} />
          <hr />
        </>
      )}
    </div>
  );
}
