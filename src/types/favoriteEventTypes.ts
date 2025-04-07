export type FavoriteEvents = {
  user_id: string;
  event_id: string;
  created_at: Date;
  deleted_at: Date;
  event: {
    id: string;
    slug: string;
    title: string;
    description: string;
    caegory_id: number;
    price: number;
    currency: string;
    location: string;
    address: string;
    capacity: number;
    created_at: Date;
    organizer_id: string;
    event_type_id: number;
    website_url: string;
    flyer_public_id: string;
    flyer_version: string;
    start_at: Date;
    end_at: Date;
    timezone: string;
    status: string;
  };
};
