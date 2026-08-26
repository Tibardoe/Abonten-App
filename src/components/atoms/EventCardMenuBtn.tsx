import { useState } from "react";
import EventCardMenuModal from "../molecules/EventCardMenuModal";
import MaskIcon from "./MaskIcon";

type EventProp = {
  eventId?: string;
  eventTitle?: string;
  eventCode: string;
  address: string;
  organizerId?: string;
  eventStatus?: string;
};

export default function EventCardMenuBtn({
  eventId,
  eventTitle,
  eventCode,
  address,
  organizerId,
  eventStatus,
}: EventProp) {
  const [showMenu, setShowMenu] = useState(false);

  const handleShowMenu = () => {
    setShowMenu((prevState) => !prevState);
  };
  return (
    <div className="relative flex-shrink-0">
      <button type="button" onClick={handleShowMenu}>
        <MaskIcon
          src="/assets/images/menuDots.svg"
          alt="Event options"
          className="w-5 h-5"
        />
      </button>
      {showMenu && (
        <EventCardMenuModal
          eventId={eventId ? eventId : ""}
          eventTitle={eventTitle ? eventTitle : ""}
          eventCode={eventCode}
          address={address ? address : ""}
          organizerId={organizerId}
          eventStatus={eventStatus}
        />
      )}
    </div>
  );
}
