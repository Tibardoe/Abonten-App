import { createClient } from "@/config/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { message: "User not logged in" },
        { status: 401 },
      );
    }

    const userId = user.id;

    const { data, error } = await supabase
      .from("user_profile_detail")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { message: "User profile not found", error: error?.message },
        { status: 404 },
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("Error fetching user profile", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
