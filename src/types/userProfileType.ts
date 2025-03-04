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
  displayName?: string;
  email?: string;
  provider?: Provider;
  url?: string;
};
