import { z } from "zod";

// Validates an event draft's payload before it's saved. Deliberately
// distinct from getEventSchema (src/utils/eventSchema.ts) and the
// imperative checks in useEventUploadForm's onSubmit, both of which enforce
// "is this complete enough to publish?". This schema only enforces "is
// whatever's present well-typed?" — every field is optional, so a draft
// that's just a title is valid, but a field that IS present must have the
// right shape (matches useEventUploadForm's state shapes 1:1).

const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const dateEntrySchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

const ticketSchema = z.object({
  category: z.string().optional(),
  price: z.number(),
  quantity: z.number().nullable().optional(),
  availableFrom: z.coerce.date().optional(),
  availableUntil: z.coerce.date().optional(),
});

const promoCodeSchema = z.object({
  promoCode: z.string(),
  discount: z.number(),
  maximumUse: z.number(),
  expiryDate: z.coerce.date(),
});

const receivingAccountDetailsSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  bankName: z.string().optional(),
  branch: z.string().optional(),
  bankAccountNumber: z.string().optional(),
});

export const eventDraftPayloadSchema = z.object({
  title: z.string().max(150).optional(),
  description: z.string().optional(),
  websiteUrl: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  category: z.string().optional(),
  types: z.array(z.string()).optional(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  dateType: z.enum(["single", "specific"]).optional(),
  singleDateRange: dateRangeSchema.optional(),
  multipleDates: z.array(dateEntrySchema).optional(),
  ticket: z.string().nullable().optional(),
  singleTicket: z.number().nullable().optional(),
  singleTicketQuantity: z.number().nullable().optional(),
  multipleTickets: z.array(ticketSchema).optional(),
  promoCodes: z.array(promoCodeSchema).optional(),
  requireRegistration: z.boolean().optional(),
  featured: z.boolean().optional(),
  paymentOption: z.string().nullable().optional(),
  selectedNetwork: z.string().nullable().optional(),
  receivingAccountDetails: receivingAccountDetailsSchema.optional(),
  currency: z.string().nullable().optional(),
});

export type EventDraftPayload = z.infer<typeof eventDraftPayloadSchema>;
