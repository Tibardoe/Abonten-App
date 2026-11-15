import { ticketTransferAnswerRoute } from "@/app/api/mobile/_lib/ticketTransferAnswer";

// POST /api/mobile/ticket-transfers/:transferId/cancel
export const POST = ticketTransferAnswerRoute("cancel");
