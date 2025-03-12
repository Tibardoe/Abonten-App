import { supabase } from "@/config/supabase";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return NextResponse.json(
        { error: "Invalid token format" },
        { status: 401 },
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { message: "User not logged in" },
        { status: 401 },
      );
    }

    const userId = user.id;

    console.log(userId);

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
