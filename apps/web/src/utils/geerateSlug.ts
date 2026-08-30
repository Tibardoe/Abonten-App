export function generateSlug(title: string) {
  return title
    .toLowerCase() // Convert to lowercase
    .replace(/[^\w\s-]/g, "") // Remove non-alphanumeric characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with a single hyphen
}

export function undoSlug(slug: string) {
  return slug
    .replace(/-/g, " ") // Hyphens to spaces
    .replace(/\b\w/g, (char) => char.toUpperCase()); // Capitalize words
}
