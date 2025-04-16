"use client";

import { supabase } from "@/config/supabase/client";
import Image from "next/image";
import { useEffect, useState } from "react";
import ReviewModal from "../organisms/ReviewModal";

export default function AddReviewButton({ username }: { username: string }) {
  const [showReviewModal, setShowReviewModal] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);

  const handleShowReviewModal = (state: boolean) => {
    setShowReviewModal(state);
  };

  useEffect(() => {
    const getUser = async () => {
      const { data: user } = await supabase.auth.getUser();
      if (user.user) {
        setUserId(user.user?.id);
      }
    };

    getUser();
  }, []);

  if (!userId) return;

  return (
    <>
      {showReviewModal && (
        <ReviewModal
          handleShowReviewModal={handleShowReviewModal}
          username={username}
        />
      )}

      <button
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
      </button>
    </>
  );
}
