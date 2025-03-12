import type { Provider } from "@supabase/supabase-js";

export type userProfileType = {
  id: string;
  statusId: number;
  displayName?: string;
  email?: string;
  phone?: string;
  createdAt: Date;
  lastSignInAt: Date;
  username?: string;
  fullName?: string;
  avatarPublicId?: string;
  avatarVersion?: string;
  bio?: string;
  updatedAt: Date;
};

export type authUserType = {
  id: string;
  fullName?: string;
  email?: string;
  provider?: Provider;
  url?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
};

export type userProfileDetailsType = {
  id: string;
  username?: string;
  fullName?: string;
  avatarPublicId?: string;
  avatarVersion?: string;
  bio?: string;
  eventId?: string;
  title?: string;
  price?: number;
  currency?: string;
  address?: string;
  flyerPublicId?: string;
  flyerVersion?: string;
  startAt?: Date;
  endsAt?: Date;
  favoriteEventId?: string;
  reviewId?: string;
  reviewerId?: string;
  reviewdId?: string;
  rating?: number;
  comment?: string;
  reviewCreatedAt?: string;
  highlightCOntent?: string;
  highlightMediaUrl?: string;
  highlightCreatedAt?: string;
};
