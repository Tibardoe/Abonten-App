import { eventCategoriesAndTypes } from "@/data/eventCategoriesAndTypes";
import { eventCategoryLabel } from "@abonten/core/categoryLabels";
import { useTranslations } from "next-intl";
import TileSelector from "./TileSelector";

type CategoryType = {
  category: string;
  handleCategory: (categoryName: string) => void;
  classname?: string;
};

export default function CategoryFilter({
  handleCategory,
  category,
  classname,
}: CategoryType) {
  const t = useTranslations("common");
  const tc = useTranslations("core");
  // The id is the stored (English) name; only the label is translated.
  const categoryOptions = eventCategoriesAndTypes.map((c) => ({
    id: c.category,
    label: eventCategoryLabel(tc, c.category),
  }));

  return (
    <TileSelector
      mode="single"
      options={categoryOptions}
      value={category}
      onChange={handleCategory}
      label={t("category")}
      labelClassName={classname}
    />
  );
}
