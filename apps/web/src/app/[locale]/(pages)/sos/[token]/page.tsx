import SafetyLiveView from "@/safety/organisms/SafetyLiveView";

export const dynamic = "force-dynamic";

// The page a trusted contact opens from an alert text. Nothing about the
// alert is rendered on the server: a messaging app that fetches the link
// for a preview must neither see where someone is nor count as the contact
// having opened it. The browser asks once it is running (SafetyLiveView).
export default async function SafetyAlertPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SafetyLiveView token={token} />;
}
