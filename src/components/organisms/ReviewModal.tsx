import { postReview } from "@/actions/postReview";
import { supabase } from "@/config/supabase/client";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import StarRatingInput from "../atoms/StarRatingInput";
import { Button } from "../ui/button";

type ShowReviewModalProp = {
  handleShowReviewModal: (state: boolean) => void;
  username: string;
};

const eventSchema = z.object({
  title: z
    .string()
    .min(1, { message: "Title is required" })
    .max(150, { message: "Title must be less than 150 characters" }),

  review: z.string().min(1, { message: "Description is required" }),
});

export default function ReviewModal({
  handleShowReviewModal,
  username,
}: ShowReviewModalProp) {
  const [rating, setRating] = useState(0);

  const [reviewedId, setReiewedId] = useState("");

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const handleRatingChange = (value: number) => {
    setRating(value);
  };

  const onSubmit = async (formData: z.infer<typeof eventSchema>) => {
    const finalData = {
      ...formData,
      rating: rating,
      reviewedId: reviewedId,
    };

    const response = await postReview(finalData);

    if (response?.status === 200) {
      alert("Event posted successfully!");
    } else {
      alert(`Something went wrong: ${response?.message}`);
    }
  };

  useEffect(() => {
    const fetchReviewedDetails = async () => {
      try {
        const { data: user } = await supabase
          .from("user_info")
          .select("id")
          .eq("username", username)
          .single();

        if (user) {
          setReiewedId(user.id);
        }
      } catch (error) {
        console.log(error);
      }
    };

    fetchReviewedDetails();
  }, [username]);

  return (
    <div className="fixed top-0 left-0 h-dvh w-full bg-black bg-opacity-50 z-10 flex justify-center items-center">
      <div className="w-full self-end md:self-center h-[95%] p-4 md:w-[70%] lg:w-[40%] bg-white md:p-4 rounded-lg space-y-5">
        {/* header */}
        <div className="flex justify-between items-center">
          <button
            type="button"
            className="md:hidden font-bold"
            onClick={() => handleShowReviewModal(false)}
          >
            Cancel
          </button>

          <h1 className="mx-auto text-xl md:text-2xl font-bold">Add Review</h1>

          <button
            type="submit"
            className="md:hidden font-bold"
            onClick={handleSubmit(onSubmit)}
          >
            Submit
          </button>

          <button
            type="button"
            className="hidden md:flex"
            onClick={() => handleShowReviewModal(false)}
          >
            <Image
              src="/assets/images/circularCancel.svg"
              alt="Cancel"
              width={25}
              height={25}
            />
          </button>
        </div>

        {/* Content */}

        <div className="space-y-4">
          <div className="flex items-center justify-between md:flex-col md:justify-start md:items-start md:gap-2">
            <p className="font-normal">Rate</p>
            <StarRatingInput onChange={handleRatingChange} />
          </div>
          {rating <= 0 && (
            <p className="text-red-500 text-sm">Rating required</p>
          )}

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <input
              type="text"
              placeholder="Title"
              className="border border-black rounded-lg py-4 px-2 font-normal"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-red-500 text-sm">{errors.title.message}</p>
            )}

            <textarea
              rows={10}
              placeholder="Review"
              className="border border-black rounded-lg py-4 px-2 font-normal"
              {...register("review")}
            />
            {errors.review && (
              <p className="text-red-500 text-sm">{errors.review.message}</p>
            )}

            <Button
              type="submit"
              className="rounded-full px-6 py-3 self-end font-bold hidden md:flex"
            >
              Add
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
