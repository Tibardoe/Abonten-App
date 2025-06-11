import type React from "react";
import { useState } from "react";
import { IoIosStar } from "react-icons/io";

type Props = {
  onChange: (rating: number) => void;
  totalStars?: number;
};

const StarRatingInput: React.FC<Props> = ({ onChange, totalStars = 5 }) => {
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(0);

  const handleClick = (index: number) => {
    setSelectedRating(index);
    onChange(index); // pass the value up
  };

  return (
    <div className="flex">
      {Array.from({ length: totalStars }, (_, index) => {
        const starIndex = index + 1;
        return (
          <button
            type="button"
            key={starIndex}
            onClick={() => handleClick(starIndex)}
            onMouseEnter={() => setHoveredStar(starIndex)}
            onMouseLeave={() => setHoveredStar(null)}
            className="focus:outline-none"
          >
            <IoIosStar
              className={`text-xl md:text-2xl transition-colors ${
                (hoveredStar ?? selectedRating) >= starIndex
                  ? "text-black"
                  : "text-gray-400"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
};

export default StarRatingInput;
