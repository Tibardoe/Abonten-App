export function generateSlug(title: string) {
  return title
    .toLowerCase() // Convert to lowercase
    .replace(/[^\w\s-]/g, "") // Remove non-alphanumeric characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with a single hyphen
}
