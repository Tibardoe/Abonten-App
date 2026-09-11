import { cn } from "@/components/lib/utils";

const TONES: Record<string, string> = {
  // assignment
  assigned: "bg-secondary text-secondary-foreground",
  started: "bg-primary/15 text-primary",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground line-through",
  // prospect
  identified: "bg-secondary text-secondary-foreground",
  contacted: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  interested: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  declined: "bg-muted text-muted-foreground",
  converted: "bg-primary/15 text-primary",
  // territory coverage / status
  covered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  uncovered: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  // campaign / membership
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  draft: "bg-secondary text-secondary-foreground",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  winding_down: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  archived: "bg-muted text-muted-foreground",
  invited: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  suspended: "bg-destructive/15 text-destructive",
  left: "bg-muted text-muted-foreground",
};

/** A small status pill; the label is the status with underscores spaced. */
export default function StatusChip({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        TONES[status] ?? "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
