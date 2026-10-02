import { publicSupabase } from "@/config/supabase/publicClient";
import { rowOrFailure } from "@/utils/rowOrFailure";
import { notFound } from "next/navigation";

// "Does this event exist" is decided here, in the segment layout, because
// the page sits behind a loading boundary: by the time the page body (or its
// metadata) runs, the 200 shell has already been streamed and a notFound()
// there can only render the not-found UI inline. A layout renders before
// the shell is flushed, so a missing code becomes a real 404 response for
// browsers and crawlers alike. One indexed lookup by event_code.
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = await params;
  // A lookup that failed is a 500, never a 404 (utils/rowOrFailure.ts).
  const data = rowOrFailure(
    await publicSupabase
      .from("event")
      .select("id")
      .eq("event_code", eventCode.toUpperCase())
      .maybeSingle(),
    "event",
  );
  if (!data) notFound();
  return children;
}
