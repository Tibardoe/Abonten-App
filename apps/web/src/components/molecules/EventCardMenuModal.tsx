import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getEventShareUrl } from "@/utils/shareUrl";
import AddToFavoriteButton from "../atoms/AddToFavoriteButton";
import CancelButton from "../atoms/CancelButton";
import DeleteEventButton from "../atoms/DeleteEventButton";
import EditEventButton from "../atoms/EditEventButton";
import ManagePromoCodesButton from "../atoms/ManagePromoCodesButton";
import ShareButton from "../atoms/ShareButton";
import {
  DropdownMenuContent,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";

type EventProp = {
  eventId: string;
  eventTitle: string;
  eventCode: string;
  address: string;
  organizerId?: string;
  eventStatus?: string;
  /** Closes the parent dropdown -- passed to the items that open their own
   * confirmation dialog, so finishing (or backing out of) that dialog also
   * closes the menu it was opened from. */
  onRequestClose: () => void;
};

// Content for EventCardMenuBtn's DropdownMenu -- built on shadcn/Radix
// DropdownMenu (see ManageMenu.tsx, which established this pattern) instead
// of a hand-rolled absolutely-positioned div, so this menu gets real focus
// trapping, arrow-key navigation, typeahead, and outside-click/Escape
// dismissal for free.
export default function EventCardMenuModal({
  eventId,
  eventTitle,
  address,
  eventCode,
  organizerId,
  eventStatus,
  onRequestClose,
}: EventProp) {
  const shareUrl = getEventShareUrl(eventCode, address);

  // Shared with Header/SideBar/etc. — one cached fetch instead of each
  // component independently calling supabase.auth.getUser().
  const { data: userData } = useCurrentUser();

  const isOrganizer = userData?.id === organizerId;
  const isCancelled = eventStatus === "canceled";

  return (
    <DropdownMenuContent align="end" className="w-60 font-medium">
      <AddToFavoriteButton eventId={eventId} asMenuItem />

      <ShareButton title={eventTitle} url={shareUrl} asMenuItem />

      {isOrganizer && (
        <>
          <DropdownMenuSeparator />
          <EditEventButton eventId={eventId} asMenuItem />

          {!isCancelled && (
            <ManagePromoCodesButton
              eventId={eventId}
              asMenuItem
              onRequestClose={onRequestClose}
            />
          )}

          {isCancelled ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              This event has been cancelled
            </p>
          ) : (
            <CancelButton
              eventId={eventId}
              asMenuItem
              onRequestClose={onRequestClose}
            />
          )}

          <DropdownMenuSeparator />
          <DeleteEventButton
            eventId={eventId}
            asMenuItem
            onRequestClose={onRequestClose}
          />
        </>
      )}
    </DropdownMenuContent>
  );
}
