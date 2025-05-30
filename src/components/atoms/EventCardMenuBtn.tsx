import Image from "next/image";
import { useState } from "react";
import EventCardMenuModal from "../molecules/EventCardMenuModal";

type EventProp = {
  eventId?: string;
  eventTitle?: string;
  address: string;
};

export default function EventCardMenuBtn({
  eventId,
  eventTitle,
  address,
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
          address={address ? address : ""}
        />
      )}
    </div>
  );
}
