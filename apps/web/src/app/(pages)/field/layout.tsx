import FieldOpsTabs from "@/fieldOps/atoms/FieldOpsTabs";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import { tagFieldOpsRequest } from "@/fieldOps/lib/tagFieldOpsRequest";
import { notFound } from "next/navigation";

// The Field Ops area for team leads and members. It doesn't exist for
// anyone else: the programme must be on and the visitor must be on a team
// (a stranger gets the same 404 a switched-off Rewards page gives).

export default async function FieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await loadFieldOpsMe();
  if (me.status !== 200 || !me.data?.programEnabled || !me.data.current) {
    notFound();
  }
  // So a field member's error is separable from the rest of the app's
  // traffic. No names, no numbers -- just the campaign and the role.
  tagFieldOpsRequest({
    campaignId: me.data.current.campaign.id,
    role: me.data.current.membership.role,
    isLead: me.data.current.isLead,
  });
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <FieldOpsTabs
        isLead={me.data.current.isLead}
        role={me.data.current.membership.role}
      />
      {children}
    </div>
  );
}
