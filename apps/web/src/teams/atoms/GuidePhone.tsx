// A small drawn phone for the team guide (/teams): a sketch of a screen,
// not a screenshot, so it never goes stale against the real app and reads
// in every language. `label` describes the sketch for screen readers.
export default function GuidePhone({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="mx-auto flex w-full max-w-[230px] flex-col items-center gap-2">
      <div
        role="img"
        aria-label={label}
        className="w-full rounded-[30px] bg-foreground p-2.5 shadow-lg"
      >
        <div className="flex min-h-[300px] flex-col gap-2.5 rounded-[22px] bg-background p-3 text-xs">
          {children}
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
