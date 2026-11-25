"use client";

import { getTeamPhotoUploadSignature } from "@/actions/teams/getTeamPhotoUploadSignature";
import { saveTeamPhoto } from "@/actions/teams/saveTeamPhoto";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import {
  isUploadCancelled,
  uploadToCloudinary,
} from "@/utils/uploadToCloudinary";
import { logger } from "@abonten/core/logger";
import { MAX_AVATAR_UPLOAD_SIZE_BYTES } from "@abonten/core/uploadLimits";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useRefreshTeams } from "../useTeams";

/**
 * An Owner changes the team's photo: straight to Cloudinary with a
 * signature for the team's own folder, then saved for the team (the same
 * pipeline as a person's photo, scoped to the team).
 */
export default function TeamPhotoButton({ teamId }: { teamId: string }) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const toast = useToast();
  const refresh = useRefreshTeams();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (file.size > MAX_AVATAR_UPLOAD_SIZE_BYTES) {
      toast.error(tc("fileIsTooLargePleaseUpload"));
      return;
    }
    setBusy(true);
    try {
      const sig = await getTeamPhotoUploadSignature({ teamId });
      if (sig.status !== 200 || !("data" in sig) || !sig.data) {
        toast.error(sig.message ?? tc("failedToStartUpload"));
        return;
      }
      const {
        timestamp,
        signature,
        apiKey,
        cloudName,
        folder,
        allowedFormats,
      } = sig.data;
      const { promise } = uploadToCloudinary({
        file,
        cloudName: cloudName as string,
        apiKey: apiKey as string,
        timestamp,
        signature,
        folder,
        allowedFormats,
        resourceType: "image",
      });
      const result = await promise;
      const saved = await saveTeamPhoto({
        teamId,
        publicId: result.public_id,
        version: result.version,
        transformation: `${result.width}, ${result.height}`,
      });
      if (saved.status === 200) {
        toast.success(saved.message ?? tc("uploadSuccessful"));
        refresh();
      } else {
        toast.error(saved.message ?? tc("uploadFailedPleaseTryAgain"));
      }
    } catch (error) {
      if (!isUploadCancelled(error)) {
        logger.error("TeamPhotoButton upload failed", error);
        toast.error(tc("uploadFailedPleaseTryAgain"));
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
        className="hidden"
        aria-label={t("changePhoto")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? t("photoUploading") : t("changePhoto")}
      </Button>
    </>
  );
}
