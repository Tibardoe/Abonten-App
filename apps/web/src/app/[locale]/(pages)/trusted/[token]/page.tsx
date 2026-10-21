import SafetyInviteResponse from "@/safety/organisms/SafetyInviteResponse";

export const dynamic = "force-dynamic";

// The page a new trusted contact opens from their invite text: accept,
// decline, or stop every Abonten Safety text to their number. No account
// needed; accepting while signed in also brings alerts to their Abonten app.
export default async function SafetyInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SafetyInviteResponse token={token} />;
}
