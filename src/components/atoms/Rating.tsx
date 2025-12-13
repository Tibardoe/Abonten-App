import type React from "react";
import { IoIosStar, IoIosStarHalf, IoIosStarOutline } from "react-icons/io";

type Props = {
  rating: number; // e.g., 3.5
  totalStars?: number; // default to 5
};

const StarRatingDisplay: React.FC<Props> = ({ rating, totalStars = 5 }) => {
  const stars = [];

  for (let i = 1; i <= totalStars; i++) {
    if (i <= rating) {
      stars.push(<IoIosStar key={i} className="text-mint text-xl" />);
    } else if (i - rating < 1) {
      stars.push(<IoIosStarHalf key={i} className="text-mint text-xl" />);
    } else {
      stars.push(
        <IoIosStarOutline key={i} className="text-gray-400 text-xl" />,
      );
    }
  }

  return <div className="flex">{stars}</div>;
};

export default StarRatingDisplay;
