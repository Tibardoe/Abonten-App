"use server";

import { createSsrClient } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export async function signOut() {
  const supabase = await createSsrClient();
  await supabase.auth.signOut();
  redirect("/auth/signin");
}
