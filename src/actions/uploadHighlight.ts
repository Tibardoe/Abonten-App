"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/config/supabase/server";
import type { MediaItem } from "@/types/mediaItemType";
import {
  type UploadApiResponse,
  v2 as cloudinary,
  // type UploadApiErrorResponse,
} from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default async function uploadHighlight(mediaItems: MediaItem[]) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Sign in to upload highlight!" };
  }

  const groupId = randomUUID();

  const results = await Promise.allSettled(
    mediaItems.map(async (item) => {
      const arrayBuffer = await item.file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const uploadOptions = {
        resource_type: item.type,
        folder: "highlight_media",
        eager:
          item.type === "video"
            ? [
                { quality: "auto", fetch_format: "auto" },
                { width: 300, height: 300, crop: "thumb", format: "jpg" },
              ]
            : undefined,
        // transformation: buildTransformations(item.transformations),
      };

      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) return reject(error);
            if (!result) return reject(new Error("Upload failed"));
            resolve(result);
          },
        );
        stream.end(buffer);
      });

      const { error: dbError } = await supabase.from("highlight").insert({
        user_id: user.id,
        media_url: result.secure_url,
        media_type: item.type,
        thumbnail_url:
          item.type === "video"
            ? (result.eager?.[1]?.secure_url ?? null)
            : null,
        media_duration: item.type === "video" ? result.duration : null,
        group_id: groupId,
      });

      if (dbError) throw new Error(dbError.message);
    }),
  );

  const failed = results.filter((r) => r.status === "rejected");

  if (failed.length > 0) {
    console.error(
      "Upload failed for some media:",
      failed.map((f) => f.reason),
    );

    return {
      status: 500,
      message: `Uploaded ${mediaItems.length - failed.length}, failed ${
        failed.length
      }.`,
    };
  }

  return { status: 200, message: "Highlight uploaded successfully." };
}

// export default async function uploadHighlight(mediaItems: MediaItem[]) {
//   const supabase = await createClient();

//   const {
//     data: { user },
//     error: userError,
//   } = await supabase.auth.getUser();

//   if (!user || userError) {
//     console.log(`Error fetching user: ${userError?.message}`);

//     return { status: 401, message: "Sign in to upload highlight!" };
//   }

//   const uploadPromises = mediaItems.map(async (item, index) => {
//     const arrayBuffer = await item.file.arrayBuffer();
//     const buffer = Buffer.from(arrayBuffer);

//     // Upload options
//     const uploadOptions = {
//       resource_type: item.type,
//       folder: "highlight_media",
//       eager:
//         item.type === "video"
//           ? [
//               { quality: "auto", fetch_format: "auto" },
//               { width: 300, height: 300, crop: "thumb", format: "jpg" }, // Generate thumbnail
//             ]
//           : undefined,
//       transformation: buildTransformations(item.transformations),
//     };

//     // Upload to Cloudinary
//     const result = await new Promise<UploadApiResponse>((resolve, reject) => {
//       const stream = cloudinary.uploader.upload_stream(
//         uploadOptions,
//         (
//           error: UploadApiErrorResponse | undefined,
//           result: UploadApiResponse | undefined
//         ) => {
//           if (error) return reject(error);
//           if (!result) return reject(new Error("Upload failed with no result"));
//           resolve(result);
//         }
//       );
//       stream.end(buffer);
//     });

//     // Save to Supabase
//     const { error: highlightInsertError } = await supabase
//       .from("highlight")
//       .insert({
//         user_id: user.id,
//         media_url: result.secure_url,
//         media_type: item.type,
//         thumbnail_url:
//           item.type === "video" ? result.eager?.[1]?.secure_url : null,
//         duration: item.type === "video" ? result.duration : null,
//       });

//     if (highlightInsertError) {
//       console.log(`Error uploading highlight:${highlightInsertError.message}`);

//       return {
//         status: 500,
//         message: "Failed to upload highlight! Please try again.",
//       };
//     }
//   });
// }
