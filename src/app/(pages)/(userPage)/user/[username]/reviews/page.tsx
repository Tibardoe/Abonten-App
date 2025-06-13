import { getUserReviews } from "@/actions/getUserReviews";
import Rating from "@/components/atoms/Rating";
import { Button } from "@/components/ui/button";
import { getRelativeTime } from "@/utils/dateFormatter";
import { ClockIcon, UserIcon } from "lucide-react"; // Assuming you're using Lucide

export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  let userReviews = [];

  try {
    const response = await getUserReviews(username);

    if (response.status === 200 && response.data) {
      userReviews = response.data;
    } else {
      return (
        <div className="text-center mt-5 text-red-500">
          Failed to load reviews: {response.message}
        </div>
      );
    }
  } catch (error) {
    console.log(error);
    return (
      <div className="text-center mt-5 text-red-500">
        An error occurred while fetching reviews.
      </div>
    );
  }

  return userReviews.length > 0 ? (
    <ul className="flex flex-col gap-6">
      {userReviews.map((review) => (
        <li
          key={review.title + review.created_at}
          className="w-full bg-white shadow-sm hover:shadow-md transition rounded-xl p-5 flex flex-col gap-3 border border-gray-200"
        >
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">
              {review.title}
            </h2>
            <Rating rating={review.rating} />
          </div>

          <p className="text-gray-700 text-justify leading-relaxed">
            {review.comment}
          </p>

          <div className="flex flex-wrap items-center text-sm gap-4 text-gray-500">
            <div className="flex items-center gap-1">
              <UserIcon size={16} />
              <span>{review.user_info.username}</span>
            </div>
            <div className="flex items-center gap-1">
              <ClockIcon size={16} />
              <span>{getRelativeTime(review.created_at)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <div className="flex flex-col items-center justify-center mt-10 gap-4 text-center">
      <h1 className="text-2xl font-bold text-gray-800">No reviews yet</h1>
      <p className="text-gray-600">
        Be the first to leave a review and rating.
      </p>
      <Button className="px-6 py-3 text-lg rounded-full font-semibold">
        Add Review
      </Button>
    </div>
  );
}
