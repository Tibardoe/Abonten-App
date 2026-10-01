import { useSession } from "@/auth/SessionProvider";
import { NotFoundError } from "@/lib/queryErrors";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";
import { TICKET_WITH_EVENT_SELECT } from "@abonten/core/ticketSelect";
import type { UserTicketType } from "@abonten/types/ticketType";
import { translatorFor } from "@abonten/ui-native/i18n";
import { useQuery } from "@tanstack/react-query";

type Row = UserTicketType & { ticket_type: { event: UserTicketType["event"] } };

async function fetchTicketDetail(
  id: string,
  userId: string,
): Promise<UserTicketType> {
  // `.eq("user_id", …)` is redundant with the `ticket` owner-select RLS
  // policy but keeps the query explicit and identical in intent to
  // useMyTickets.
  if (!isUuid(id)) throw new NotFoundError(translatorFor("tickets")("ticket"));

  const { data, error } = await supabase
    .from("ticket")
    .select(TICKET_WITH_EVENT_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError(translatorFor("tickets")("ticket"));

  const row = data as unknown as Row;
  return { ...row, event: row.ticket_type.event };
}

export function useTicketDetail(id: string | undefined) {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ["mobile", "ticket", id, userId],
    enabled: !!id && !!userId,
    queryFn: () => fetchTicketDetail(id ?? "", userId ?? ""),
  });
}
