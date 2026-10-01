import { publicSupabase } from "@/config/supabase/publicClient";
import { notFound } from "next/navigation";

// See events/[eventCode]/layout.tsx: the existence check lives in the
// segment layout so a missing or unpublished place is a real 404 response,
// not a 200 shell with the not-found UI streamed into it.
export default async function PlaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data } = await publicSupabase
    .from("place")
    .select("id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data) notFound();
  return children;
}
