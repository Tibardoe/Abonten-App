import { Button } from "@/components/ui/button";
import Link from "next/link";

// The one "this page doesn't exist" body, rendered both for unmatched URLs
// (app/not-found.tsx) and for notFound() calls inside the main layout
// ((pages)/not-found.tsx). It never dead-ends: the two most useful places
// to go next are one tap away.
export default function PageNotFound({
  title = "We couldn't find that page",
  description = "The link may be out of date, or the event or place it pointed to is no longer listed.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section
      aria-labelledby="not-found-title"
      className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 text-center"
    >
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        404
      </p>
      <h1 id="not-found-title" className="text-2xl font-semibold">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">Go to the home page</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/explore">Explore events and places</Link>
        </Button>
      </div>
    </section>
  );
}
