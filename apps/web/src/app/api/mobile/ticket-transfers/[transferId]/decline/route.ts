import { ticketTransferAnswerRoute } from "@/app/api/mobile/_lib/ticketTransferAnswer";

// POST /api/mobile/ticket-transfers/:transferId/decline
export const POST = ticketTransferAnswerRoute("decline");
