"use client";

import { supabase } from "@/config/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import ReviewModal from "../organisms/ReviewModal";
import { Button } from "../ui/button";

export default function AddReviewButton({ username }: { username: string }) {
  const [showReviewModal, setShowReviewModal] = useState(false);

  const handleShowReviewModal = (state: boolean) => {
    setShowReviewModal(state);
  };

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        return user.id;
      }

      return null;
    },
  });

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
        className="p-3 rounded-md font-semibold"
        onClick={() => handleShowReviewModal(true)}
      >
        Add Review
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
