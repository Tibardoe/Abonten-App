"use client";

import { eventCategoriesAndTypes } from "@/data/eventCategoriesAndTypes";
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
  const types =
    eventCategoriesAndTypes.find((c) => c.category === selectedCategory)
      ?.types ?? [];

  return (
    <TileSelector
      mode="multi"
      options={types.map((type) => ({ id: type, label: type }))}
      value={selectedTypes}
      onChange={handleType}
      label="Type"
      labelClassName={classname}
    />
  );
}
