-- Full-system audit 2026-09-25: text columns an owner writes directly
-- (Data API) that had no length bound in the database. The forms cap them
-- (titles/names 150, names 120); the database now refuses anything far past
-- that, so a direct write can't store megabytes in a name that every list,
-- card, email and push renders. Existing data is well inside (largest
-- production values: 28-char title, 17-char name).

alter table public.event
  add constraint event_title_length check (length(title) <= 200) not valid,
  add constraint event_website_url_length
    check (website_url is null or length(website_url) <= 500) not valid;
alter table public.event validate constraint event_title_length;
alter table public.event validate constraint event_website_url_length;

alter table public.place
  add constraint place_name_length check (length(name) <= 200) not valid,
  add constraint place_website_url_length
    check (website_url is null or length(website_url) <= 500) not valid,
  add constraint place_phone_length
    check (phone is null or length(phone) <= 40) not valid,
  add constraint place_whatsapp_length
    check (whatsapp is null or length(whatsapp) <= 40) not valid;
alter table public.place validate constraint place_name_length;
alter table public.place validate constraint place_website_url_length;
alter table public.place validate constraint place_phone_length;
alter table public.place validate constraint place_whatsapp_length;

alter table public.user_info
  add constraint user_info_full_name_length
    check (full_name is null or length(full_name) <= 120) not valid,
  add constraint user_info_website_length
    check (website is null or length(website) <= 500) not valid;
alter table public.user_info validate constraint user_info_full_name_length;
alter table public.user_info validate constraint user_info_website_length;

alter table public.place_booking
  add constraint place_booking_note_length
    check (note is null or length(note) <= 1000) not valid,
  add constraint place_booking_party_size_range
    check (party_size is null or party_size between 1 and 500) not valid;
alter table public.place_booking validate constraint place_booking_note_length;
alter table public.place_booking validate constraint place_booking_party_size_range;
