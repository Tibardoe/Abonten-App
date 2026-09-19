import type { Metadata } from "next";

// Sign-in and OAuth callback: never indexed.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
