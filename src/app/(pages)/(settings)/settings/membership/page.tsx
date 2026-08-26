import { redirect } from "next/navigation";

// The Membership product was removed — see /settings/overview's Promotion
// Details section, and Manage → Events/Places → Promotion for the current
// resource-specific promotion packages. Kept only so old bookmarks/links land
// somewhere useful instead of 404ing.
export default function page() {
  redirect("/settings/overview");
}
