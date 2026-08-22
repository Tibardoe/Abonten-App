import { eventCategoriesAndTypes } from "@/data/eventCategoriesAndTypes";
import TileSelector from "./TileSelector";

type CategoryType = {
  category: string;
  handleCategory: (categoryName: string) => void;
  classname?: string;
};

const categoryOptions = eventCategoriesAndTypes.map((c) => ({
  id: c.category,
  label: c.category,
}));

export default function CategoryFilter({
  handleCategory,
  category,
  classname,
}: CategoryType) {
  return (
    <TileSelector
      mode="single"
      options={categoryOptions}
      value={category}
      onChange={handleCategory}
      label="Category"
      labelClassName={classname}
    />
  );
}
