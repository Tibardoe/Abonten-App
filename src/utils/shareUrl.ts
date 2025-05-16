import { generateSlug } from "./geerateSlug";

export function getEventShareUrl(title: string, address: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_URL}/events/${generateSlug(
    address,
  )}/event/${generateSlug(title)}`;
}
