import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getEventShareUrl } from "@/utils/shareUrl";
import AddToFavoriteButton from "../atoms/AddToFavoriteButton";
import CancelButton from "../atoms/CancelButton";
import DeleteEventButton from "../atoms/DeleteEventButton";
import EditEventButton from "../atoms/EditEventButton";
import ManagePromoCodesButton from "../atoms/ManagePromoCodesButton";
import RefundButton from "../atoms/RefundButton";
import ShareButton from "../atoms/ShareButton";

type EventProp = {
  eventId: string;
  eventTitle: string;
  eventCode: string;
  address: string;
  organizerId?: string;
};

export default function EventCardMenuModal({
  eventId,
  eventTitle,
  address,
  eventCode,
  organizerId,
}: EventProp) {
  const shareUrl = getEventShareUrl(eventCode, address);

  // Shared with Header/SideBar/etc. — one cached fetch instead of each
  // component independently calling supabase.auth.getUser().
  const { data: userData } = useCurrentUser();

  const isOrganizer = userData?.id === organizerId;

  return (
    <div className="bg-popover absolute right-2 rounded-md border border-border shadow-lg p-3 min-w-60 font-medium flex flex-col gap-3 text-popover-foreground overflow-y-scroll h-36">
      <AddToFavoriteButton eventId={eventId} />

      <hr className="border-border" />

      <ShareButton title={eventTitle} url={shareUrl} />

      <hr className="border-border" />

      <RefundButton />

      <hr className="border-border" />

      {isOrganizer && (
        <>
          <EditEventButton eventId={eventId} />
          <hr className="border-border" />
          <ManagePromoCodesButton eventId={eventId} />
          <hr className="border-border" />
          <CancelButton eventId={eventId} />
          <hr className="border-border" />
          <DeleteEventButton eventId={eventId} />
          <hr className="border-border" />
        </>
      )}
    </div>
  );
}
