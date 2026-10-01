import type { Metadata } from "next";

// Organizer and place-owner management pages: never indexed. Pages under here set their own title where one is more specific.
export const metadata: Metadata = {
  // A layout that sets its own title must restate the template, or its
  // pages' titles lose " | Abonten Hub".
  title: { default: "Manage", template: "%s | Abonten Hub" },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
