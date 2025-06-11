import { supabase } from "@/config/supabase/client";
import { type UploadApiOptions, v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: Request) {
  try {
    const { mediaUrl, userId } = await req.json();

    const uploadOptions: UploadApiOptions = {
      folder: "user_profiles",
      resource_type: "image",
      // Add any transformations if needed (e.g., quality, resizing)
    };

    const uploadResponse = await cloudinary.uploader.upload(
      mediaUrl,
      uploadOptions,
    );

    const { data: userSession, error: sessionError } =
      await supabase.auth.getSession();

    if (
      !userSession.session ||
      userSession.session.user.id !== userId ||
      sessionError
    ) {
      console.log(`Error getting user session:${sessionError?.message}`);

      return NextResponse.json({ message: "No user found" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_info")
      .update({
        avatar_public_id: uploadResponse.public_id,
        avatar_version: uploadResponse.version,
      })
      .eq("id", userId);

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { message: "Error saving media details" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: uploadResponse.secure_url, data: data });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ message: "Upload failed" }, { status: 500 });
  }
}
