import { api } from "@/lib/api";
import type { SubmitReportBody } from "@abonten/api-client";
import { useMutation } from "@tanstack/react-query";

// User-facing content reporting from the native app. Unlike the old
// place-only useReportPlace (which wrote place_report straight from the
// client), this goes through POST /api/mobile/reports so the generic
// `report` pipeline — target validation, dedupe, rate-limit, priority
// seeding — runs server-side. reporter_id is taken from the Bearer token.
export function useSubmitReport() {
  return useMutation({
    mutationFn: async (body: SubmitReportBody) => {
      const res = await api.reports.submit(body);
      if (res.status !== 200) {
        throw new Error(res.message || "Couldn't submit your report.");
      }
      return res.data;
    },
  });
}
