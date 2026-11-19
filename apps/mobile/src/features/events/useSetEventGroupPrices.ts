import { api } from "@/lib/api";
import type { SetEventGroupPricesBody } from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// The event's automatic group prices ("10 or more tickets: 10% off"): PUT
// /api/mobile/organizer/events/:id/group-prices, which runs the same
// setEventGroupDiscountsCore as the web Manage page. Editable any time; an
// empty list removes them (docs/architecture/group-tickets-and-prices.md).

export function useSetEventGroupPrices() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      ...body
    }: SetEventGroupPricesBody & { eventId: string }) =>
      api.organizer.setEventGroupPrices(eventId, body),
    onSuccess: (res, vars) => {
      if (res.status === 200) {
        qc.invalidateQueries({
          queryKey: ["mobile", "organizer", "event-edit", vars.eventId],
        });
        qc.invalidateQueries({ queryKey: ["mobile", "event", vars.eventId] });
      }
    },
  });
}
