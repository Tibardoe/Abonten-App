"use server";

import { saveToSupabase } from "./saveAvatarToSupabase";

export async function saveAvatarToCloudinary(selectedFile: File) {
  if (!selectedFile) return;

  const formData = new FormData();
  formData.append("file", selectedFile);
  formData.append("upload_preset", "abonten");

  try {
    const response = await fetch(
      "https://api.cloudinary.com/v1_1/your_cloud_name/image/upload",
      {
        method: "POST",
        body: formData,
      },
    );

    const data = await response.json();

    console.log("Cloudinary Response:", data);

    if (data.secure_url) {
      const imageUrl = data.secure_url;
      const publicId = data.public_id;
      const version = data.version;

      await saveToSupabase(publicId, version);
    }
  } catch (error) {
    console.error(`Error uploading image: ${error}`);
  }
}
