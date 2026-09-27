import type { Metadata } from "next";

// One-time consent links: never indexed.
export const metadata: Metadata = {
  // A layout that sets its own title must restate the template, or its
  // pages' titles lose " | Abonten Hub".
  title: { default: "Consent", template: "%s | Abonten Hub" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
