"use client";

import { eventCategoriesAndTypes } from "@/data/eventCategoriesAndTypes";
import { eventTypeLabel } from "@abonten/core/categoryLabels";
import { useTranslations } from "next-intl";
import TileSelector from "./TileSelector";

type TypeFIlter = {
  selectedCategory: string;
  selectedTypes: string[];
  handleType: (type: string) => void;
  classname?: string;
};

export default function TypeFilter({
  selectedCategory,
  selectedTypes,
  handleType,
  classname,
}: TypeFIlter) {
  const t = useTranslations("common");
  const tc = useTranslations("core");

  const types =
    eventCategoriesAndTypes.find((c) => c.category === selectedCategory)
      ?.types ?? [];

  return (
    <TileSelector
      mode="multi"
      options={types.map((type) => ({
        id: type,
        label: eventTypeLabel(tc, type),
      }))}
      value={selectedTypes}
      onChange={handleType}
      label={t("type")}
      labelClassName={classname}
    />
  );
}
