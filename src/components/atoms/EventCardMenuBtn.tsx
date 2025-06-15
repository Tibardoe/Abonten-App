import Image from "next/image";
import { useState } from "react";
import EventCardMenuModal from "../molecules/EventCardMenuModal";

type EventProp = {
  eventId?: string;
  eventTitle?: string;
  eventCode: string;
  address: string;
  organizerId?: string;
};

export default function EventCardMenuBtn({
  eventId,
  eventTitle,
  eventCode,
  address,
  organizerId,
}: EventProp) {
  const [showMenu, setShowMenu] = useState(false);

  const handleShowMenu = () => {
    setShowMenu((prevState) => !prevState);
  };
  return (
    <div className="relative flex-shrink-0">
      <button type="button" onClick={handleShowMenu}>
        <Image
          src="/assets/images/menuDots.svg"
          alt="Event flyer"
          width={20}
          height={20}
        />
      </button>
      {showMenu && (
        <EventCardMenuModal
          eventId={eventId ? eventId : ""}
          eventTitle={eventTitle ? eventTitle : ""}
          eventCode={eventCode}
          address={address ? address : ""}
          organizerId={organizerId}
        />
      )}
    </div>
  );
}
