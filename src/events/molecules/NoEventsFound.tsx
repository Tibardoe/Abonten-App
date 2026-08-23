import { cn } from "@/components/lib/utils";
import Link from "next/link";
import { IoCalendarClearOutline } from "react-icons/io5";

// Professional, context-aware empty state for the Explore page's Events
// tab -- replaces the old static illustration + generic "No Events Found"
// copy with a clean icon treatment (matching the muted-circle-badge pattern
// used across modern discovery UIs) and a heading/description the caller
// tailors to what the user was actually looking for (a category, a
// location, a map view with no mappable results), rather than one
// one-size-fits-all message. Reused by EventsTabContent (three contexts)
// and EventsMapView.
export default function NoEventsFound({
  heading,
  description,
  action,
  compact = false,
}: {
  heading: string;
  description: string;
  action?: { label: string; href: string };
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-4 text-center gap-4",
        compact ? "min-h-[40vh] py-8" : "min-h-[50vh] py-12",
      )}
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
        <IoCalendarClearOutline className="text-3xl text-muted-foreground" />
      </div>

      <div className="max-w-sm space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {action && (
        <Link
          href={action.href}
          scroll={false}
          className="text-sm font-semibold text-primary underline underline-offset-2 hover:no-underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
