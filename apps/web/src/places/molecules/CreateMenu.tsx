"use client";

import { cn } from "@/components/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GiPartyFlags } from "react-icons/gi";
import { IoCreateOutline, IoStorefrontOutline } from "react-icons/io5";

type CreateMenuProps = {
  label: string;
  onSelectEvent: () => void;
  onSelectPlace: () => void;
  triggerClassName?: string;
  iconClassName?: string;
};

// Replacement for the old bare "Post" button at both nav trigger points
// (EventUploadButton.tsx for desktop, SideBar.tsx for mobile): a small
// anchored menu letting the owner choose between creating an Event
// (existing flow, unchanged) or a Place (new — Places feature Milestone 3).
// Built on shadcn/Radix DropdownMenu (real focus trap/keyboard nav) rather
// than the hand-rolled popover this used to be. This component only
// reports which type was chosen — it doesn't know about file pickers or
// modals, so each call site keeps its own trigger logic and just adds a
// Place branch.
export default function CreateMenu({
  label,
  onSelectEvent,
  onSelectPlace,
  triggerClassName,
  iconClassName = "text-2xl",
}: CreateMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn("flex gap-1 items-center", triggerClassName)}
        >
          <IoCreateOutline className={iconClassName} />
          {label}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem className="gap-2" onSelect={onSelectEvent}>
          <GiPartyFlags className="text-lg" />
          Event
        </DropdownMenuItem>

        <DropdownMenuItem className="gap-2" onSelect={onSelectPlace}>
          <IoStorefrontOutline className="text-lg" />
          Place
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
