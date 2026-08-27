"use client";

import { useState } from "react";
import EventCardMenuModal from "../molecules/EventCardMenuModal";
import { DropdownMenu, DropdownMenuTrigger } from "../ui/dropdown-menu";
import MaskIcon from "./MaskIcon";

type EventProp = {
  eventId?: string;
  eventTitle?: string;
  eventCode: string;
  address: string;
  organizerId?: string;
  eventStatus?: string;
};

// Controlled (rather than Radix's own uncontrolled open state) so the menu
// items that open a confirmation dialog (Delete/Cancel/Manage Promo Codes)
// can close this dropdown themselves once that dialog is done, instead of
// Radix's default "any item click closes the menu" tearing the dialog's own
// state down with it -- DropdownMenuContent (and everything inside it,
// including a menu item's own useState) unmounts whenever the dropdown
// closes, so a confirm dialog opened *from* a menu item has to outlive the
// menu closing, not the other way around.
export default function EventCardMenuBtn({
  eventId,
  eventTitle,
  eventCode,
  address,
  organizerId,
  eventStatus,
}: EventProp) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Event options"
          className="flex-shrink-0 rounded-full p-1 transition-colors hover:bg-accent"
        >
          <MaskIcon
            src="/assets/images/menuDots.svg"
            alt=""
            className="w-5 h-5"
          />
        </button>
      </DropdownMenuTrigger>

      <EventCardMenuModal
        eventId={eventId ? eventId : ""}
        eventTitle={eventTitle ? eventTitle : ""}
        eventCode={eventCode}
        address={address ? address : ""}
        organizerId={organizerId}
        eventStatus={eventStatus}
        onRequestClose={() => setOpen(false)}
      />
    </DropdownMenu>
  );
}
