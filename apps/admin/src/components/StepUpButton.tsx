"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Button } from "./ui";

// Re-runs the OAuth round trip; the callback stamps the step-up cookie so
// sensitive actions (ban user, grant role, settings) are unlocked for the
// next 10 minutes.
export function StepUpButton({ next = "/settings" }: { next?: string }) {
  async function reauth() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    );
    const origin = process.env.NEXT_PUBLIC_ADMIN_URL ?? window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?stepup=1&next=${encodeURIComponent(next)}`,
      },
    });
  }
  return (
    <Button variant="outline" size="sm" onClick={reauth}>
      Confirm identity
    </Button>
  );
}
