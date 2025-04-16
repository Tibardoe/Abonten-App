// export type PostsType = {
//   id?: string;
//   slug?: string;
//   title?: string;
//   description?: string;
//   event_category?: string;
//   event_type: string;
//   price?: number | string;
//   currency?: string;
//   location?: string;
//   latitude?: number;
//   longitude?: number;
//   address?: string;
//   capacity?: number;
//   created_at?: Date;
//   organizer_id?: string;
//   event_type_id?: number;
//   website_url?: string;
//   flyer_public_id?: string;
//   flyer_version?: string;
//   selectedFlyer: File;
//   start_at?: Date | string;
//   end_at?: Date | string;
//   timezone?: string;
//   status?: string;
//   flyerUrl?: string;
// };

export type PostsType = {
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  types: string[];
  starts_at: Date | undefined;
  ends_at: Date | undefined;
  title: string;
  description: string;
  website_url?: string | undefined;
  price?: number | undefined;
  capacity?: number | undefined;
  selectedFile: File;
  currency: string;
};

export type UserPostType = {
  created_at: Date | undefined;
  flyer_public_id?: string;
  flyer_version?: string;
  address: { full_address: string };
  starts_at: Date | undefined;
  ends_at: Date | undefined;
  title: string;
  capacity?: number | undefined;
  price?: number | undefined;
  flyerUrl?: string;
};
