import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useActingContext } from "@/teams/useActingContext";
import { getEventShareUrl } from "@abonten/core/shareUrl";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("common");

  const shareUrl = getEventShareUrl(eventCode, address);

  // Shared with Header/SideBar/etc. — one cached fetch instead of each
  // component independently calling supabase.auth.getUser().
  const { data: userData } = useCurrentUser();

  // Managing as a team, the event's actions are the team's, as far as the
  // person's role there covers them; otherwise they are the person's own.
  const acting = useActingContext(!!userData);
  const team = acting.current;
  const isOrganizer = team
    ? team.id === organizerId
    : userData?.id === organizerId;
  const canEdit = acting.can("events.manage");
  const canPromo = acting.can("promo.manage");
  // Cancelling refunds buyers: the event and refunds both (Owners).
  const canCancel = acting.can("events.manage") && acting.can("refunds.issue");
  const isCancelled = eventStatus === "canceled";

  return (
    <DropdownMenuContent align="end" className="w-60 font-medium">
      <AddToFavoriteButton eventId={eventId} asMenuItem />

      <ShareButton
        title={eventTitle}
        url={shareUrl}
        eventId={eventId}
        asMenuItem
      />

      {isOrganizer && (
        <>
          <DropdownMenuSeparator />
          {canEdit ? <EditEventButton eventId={eventId} asMenuItem /> : null}

          {canPromo && !isCancelled && (
            <ManagePromoCodesButton
              eventId={eventId}
              asMenuItem
              onRequestClose={onRequestClose}
            />
          )}

          {isCancelled ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              {t("thisEventHasBeenCancelled")}
            </p>
          ) : canCancel ? (
            <CancelButton
              eventId={eventId}
              asMenuItem
              onRequestClose={onRequestClose}
            />
          ) : null}

          {canEdit ? (
            <>
              <DropdownMenuSeparator />
              <DeleteEventButton
                eventId={eventId}
                asMenuItem
                onRequestClose={onRequestClose}
              />
            </>
          ) : null}
        </>
      )}
    </DropdownMenuContent>
  );
}
