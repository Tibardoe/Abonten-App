import type { Metadata } from "next";

// Legacy in-app admin pages: never indexed.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
