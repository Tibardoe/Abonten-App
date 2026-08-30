export const dynamic = "force-dynamic";

import OrganizerDashboard from "@/components/organisms/OrganizerDashboard";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function page() {
  return (
    <div className="flex flex-col gap-5">
      <OrganizerDashboard />
    </div>
  );
}
