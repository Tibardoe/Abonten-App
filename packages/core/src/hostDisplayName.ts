// The name shown for the person or business behind a listing ("Hosted by").
// A username the person chose is their public name. A username we made up
// for them (user12345678, `username_is_generated`) is only a placeholder,
// so their full name is shown instead while they have one: an organiser
// listed for them by the field team otherwise reads as "Hosted by
// user16673156" until they sign in and choose a username.
export function hostDisplayName(u: {
  username?: string | null;
  full_name?: string | null;
  username_is_generated?: boolean | null;
}): string {
  const fullName = u.full_name?.trim();
  if (u.username_is_generated && fullName) return fullName;
  return u.username ?? fullName ?? "";
}
