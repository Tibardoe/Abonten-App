import type { Metadata } from "next";

// One-time consent links: never indexed.
export const metadata: Metadata = {
  title: "Consent",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
