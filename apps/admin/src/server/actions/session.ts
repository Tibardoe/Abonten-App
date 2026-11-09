"use server";

import { createSsrClient } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export async function signOut() {
  const supabase = await createSsrClient();
  // The console only. Staff use the same account in the app and on the
  // website, and the default ("global") signed them out there too.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/auth/signin");
}
