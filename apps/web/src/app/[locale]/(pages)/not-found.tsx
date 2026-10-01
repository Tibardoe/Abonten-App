import PageNotFound from "@/components/molecules/PageNotFound";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

// Rendered by notFound() anywhere under the main layout, so the header and
// navigation stay in place around the message.
export default function NotFound() {
  return <PageNotFound />;
}
