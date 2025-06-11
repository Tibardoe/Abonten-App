import { getUserReviews } from "@/actions/getUserReviews";
import Rating from "@/components/atoms/Rating";
import { Button } from "@/components/ui/button";
import { reviews } from "@/data/reviews";

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

  return reviews.length > 0 ? (
    <ul className="flex flex-col gap-5">
      {reviews.map((review) => (
        <li
          key={review.title}
          className="w-full bg-black bg-opacity-5 p-5 flex flex-col gap-3 rounded-lg md:rounded-2xl text-justify text-sm md:text-md"
        >
          <h2 className="font-bold text-lg">{review.title}</h2>
          <div className="flex justify-start items-center gap-5">
            <Rating rating={review.ratingStars} />
            <p>{review.datePosted}</p>
            <p>{review.reviewer}</p>
          </div>

          <p>{review.comment}</p>
        </li>
      ))}
    </ul>
  ) : (
    <div className="flex flex-col items-center gap-3">
      <h1 className="font-bold text-2xl">No reviews yet</h1>

      <p>Leave a review and rating</p>

      <Button className="w-32 font-bold md:text-lg py-3 px-5">
        Add review
      </Button>
    </div>
  );
}
