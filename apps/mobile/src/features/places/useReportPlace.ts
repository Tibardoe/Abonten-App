import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { useMutation } from "@tanstack/react-query";

// Native echo of the web reportPlace / reportPlaceReview actions.
// `place_report` has reporter-scoped RLS (place_report_reporter_insert,
// auth.uid() = reporter_id) — the place owner deliberately gets NO access;
// only an admin reviews reports. So a report runs straight from the client,
// no /api/mobile endpoint. Exactly one of placeId / reviewId is set.

export function useReportPlace() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (input: {
      placeId?: string;
      reviewId?: string;
      reason: string;
    }) => {
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("place_report").insert({
        place_id: input.placeId ?? null,
        review_id: input.reviewId ?? null,
        reporter_id: userId,
        reason: input.reason,
        status: "pending",
      });
      if (error) throw error;
    },
  });
}
