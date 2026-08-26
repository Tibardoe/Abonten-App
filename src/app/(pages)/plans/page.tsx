import { redirect } from "next/navigation";

// The Plans/Membership product was removed — purchasable packages are now
// resource-specific promotions bought from Manage → Events/Places → Promotion.
// This route is kept only so old bookmarks/links land somewhere useful
// instead of 404ing.
export default function page() {
  redirect("/settings/overview");
}
