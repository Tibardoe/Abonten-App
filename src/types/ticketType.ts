export type Ticket = {
  category?: string;
  price: number;
  quantity?: number;
  availableFrom?: Date;
  availableUntil?: Date;
  currency?: string;
  type?: string;
  available_from?: Date;
  available_until?: Date;
};

export type TicketType = {
  price: number;
  quantity?: number;
  currency?: string;
  type: string;
  available_from?: Date;
  available_until?: Date;
};
