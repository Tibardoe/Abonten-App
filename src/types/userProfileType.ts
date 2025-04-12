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

// export type userProfileDetailsType = {
//   userData: {
//     id: string;
//     username?: string;
//     full_name?: string;
//     avatar_public_id?: string | null;
//     avatar_version?: string | null;
//     bio?: string | null;
//     event_id?: string | null;
//     title?: string | null;
//     price?: number | null;
//     currency?: string | null;
//     address?: string | null;
//     flyer_public_id?: string | null;
//     flyer_version?: string | null;
//     starts_at?: Date | null;
//     ends_at?: Date | null;
//     favorite_event_id?: string | null;
//     review_id?: string | null;
//     reviewer_id?: string | null;
//     reviewed_id?: string | null;
//     rating?: number | null;
//     comment?: string | null;
//     review_created_at?: string | null;
//     highlight_content?: string | null;
//     highlight_media_url?: string | null;
//     highlight_created_at?: string | null;
//   };
// };

export type userProfileDetailsType =
  | {
      status: number;
      message: string;
      error?: undefined;
      data?: undefined;
    }
  | {
      status: number;
      message: string;
      error: string | undefined;
      data?: undefined;
    }
  | {
      status: number;
      data: {
        id: string;
        username?: string;
        full_name?: string;
        avatar_public_id?: string | null;
        avatar_version?: string | null;
        bio?: string | null;
        event_id?: string | null;
        title?: string | null;
        price?: number | null;
        currency?: string | null;
        address?: string | null;
        flyer_public_id?: string | null;
        flyer_version?: string | null;
        starts_at?: Date | null;
        ends_at?: Date | null;
        favorite_event_id?: string | null;
        review_id?: string | null;
        reviewer_id?: string | null;
        reviewed_id?: string | null;
        rating?: number | null;
        comment?: string | null;
        review_created_at?: string | null;
        highlight_content?: string | null;
        highlight_media_url?: string | null;
        highlight_created_at?: string | null;
      };
      message?: undefined;
      error?: undefined;
    };

export type userProfileSettingsDetailsType = {
  username: string;
  fullName: string;
  bio: string;
  phone: number;
  email: string;
  subscriptionName: string;
  website: string;
  avatarPublicId: string;
  avatarVersion: string;
};

export type UserDetailsFormType = {
  username: string;
  full_name: string;
  avatar_public_id: string;
  avatar_version: string;
  bio: string;
  website: string;
};
