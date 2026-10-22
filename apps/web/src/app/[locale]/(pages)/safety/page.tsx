import SafetyHub from "@/safety/organisms/SafetyHub";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// Abonten Safety on the website: SOS, "check in on me", "share my
// location", trusted contacts and the local emergency numbers. The proxy
// keeps it signed-in only; every action re-checks the session.
export default function SafetyPage() {
  return <SafetyHub />;
}
