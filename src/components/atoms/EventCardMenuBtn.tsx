import Image from "next/image";
import { useState } from "react";
import EventCardMenuModal from "../molecules/EventCardMenuModal";

type EventProp = {
  eventId?: string;
};

export default function EventCardMenuBtn({ eventId }: EventProp) {
  const [showMenu, setShowMenu] = useState(false);

  const handleShowMenu = () => {
    setShowMenu((prevState) => !prevState);
  };
  return (
    <div className="relative">
      <button type="button" className="flex-shrink-0" onClick={handleShowMenu}>
        <Image
          src="/assets/images/menuDots.svg"
          alt="Event flyer"
          width={20}
          height={20}
        />
      </button>
      {showMenu && <EventCardMenuModal eventId={eventId ? eventId : ""} />}
    </div>
  );
}
