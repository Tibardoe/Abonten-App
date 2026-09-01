import { supabase } from "@/lib/supabase";
import type {
  HighlightGroup,
  HighlightRow,
} from "@abonten/types/highlightType";
import { useQuery } from "@tanstack/react-query";

// Native echo of the web `getUserHighlights` action + `UserHighlights`
// component. The `highlight` table has a `highlight_public_select` RLS policy
// (`USING (true)`), so the client reads it directly. Rows are grouped by
// `group_id` into "stories"; groups are ordered newest-first by their latest
// slide, slides within a group oldest-first (playback order).

async function fetchHighlights(userId: string): Promise<HighlightGroup[]> {
  const { data, error } = await supabase
    .from("highlight")
    .select("*")
    .eq("user_id", userId)
    // Safety cap, matching the web action.
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []) as HighlightRow[];
  const byGroup = new Map<string, HighlightRow[]>();
  for (const row of rows) {
    const list = byGroup.get(row.group_id) ?? [];
    list.push(row);
    byGroup.set(row.group_id, list);
  }

  const groups = [...byGroup.values()].map((slides) =>
    [...slides].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  );
  groups.sort((a, b) => {
    const aLatest = a[a.length - 1]?.created_at ?? "";
    const bLatest = b[b.length - 1]?.created_at ?? "";
    return bLatest.localeCompare(aLatest);
  });
  return groups;
}

export function useHighlights(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", "highlights", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: () => fetchHighlights(userId as string),
  });
}
