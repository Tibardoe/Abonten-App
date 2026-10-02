"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTranslations } from "next-intl";
import { useState } from "react";
import ReviewModal from "../organisms/ReviewModal";
import { Button } from "../ui/button";

export default function AddReviewButton({ username }: { username: string }) {
  const t = useTranslations("common");

  const [showReviewModal, setShowReviewModal] = useState(false);

  const handleShowReviewModal = (state: boolean) => {
    setShowReviewModal(state);
  };

  // Shared with Header/SideBar/etc. — one cached fetch instead of each
  // component independently calling supabase.auth.getUser().
  const { data: user } = useCurrentUser();

  if (!user) return;

  return (
    <>
      {showReviewModal && (
        <ReviewModal
          handleShowReviewModal={handleShowReviewModal}
          username={username}
        />
      )}

      <Button
        variant="outline"
        className="h-9 rounded-full px-4 font-semibold"
        onClick={() => handleShowReviewModal(true)}
      >
        {t("writeAReview")}
      </Button>

      {/* <button
        type="button"
        className="flex gap-1 items-cente font-bold"
        onClick={() => handleShowReviewModal(true)}
      >
        <Image
          src="/assets/images/post.svg"
          alt="Post"
          width={25}
          height={25}
        />
        Add Review
      </button> */}
    </>
  );
}
