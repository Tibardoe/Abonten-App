import { ticketTransferAnswerRoute } from "@/app/api/mobile/_lib/ticketTransferAnswer";

// POST /api/mobile/ticket-transfers/:transferId/accept
export const POST = ticketTransferAnswerRoute("accept");
