import React from "react";

type RatingProp = {
  rating: number;
};

const Rating = ({ rating }: RatingProp) => {
  const fullStars = Math.floor(rating); // Number of full stars
  const halfStar = rating % 1 !== 0; // Whether there's a half star
  const emptyStars = 5 - Math.ceil(rating); // Remaining empty stars

  return (
    <div className="flex items-center space-x-1">
      {/* Full Stars */}
      {[...Array(fullStars)].map((_, index) => (
        <span
          key={`full-${
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            index
          }`}
          className="text-black text-2xl"
        >
          &#9733;
        </span> // Full star
      ))}

      {/* Half Star */}
      {halfStar && (
        <span key="half" className="text-black text-2xl">
          &#189;
        </span>
      )}

      {/* Empty Stars */}
      {[...Array(emptyStars)].map((_, index) => (
        <span
          key={`empty-${
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            index
          }`}
          className="text-black text-2xl"
        >
          &#9734;
        </span> // Empty star
      ))}
    </div>
  );
};

export default Rating;
