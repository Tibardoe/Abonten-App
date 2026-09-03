-- §21 residual: the mobile avatar flow (useAvatarUpload) writes
-- user_info.avatar_public_id directly under RLS, so the folder-prefix guard
-- in saveAvatarToSupabase.ts (web only) doesn't cover it. A tampered mobile
-- client could set its avatar to any public_id on the Cloudinary cloud.
--
-- Enforce it at the DB instead — covers web, mobile, and any future path.
-- A trigger (not a CHECK) so it only fires when avatar_public_id actually
-- CHANGES: the 6 pre-signed-upload rows still on the flat "user_profiles/<x>"
-- shape keep working for every other profile edit, and are only held to the
-- rule if/when their owner picks a new avatar (which uploads to the
-- per-user folder anyway).

create or replace function public.enforce_avatar_public_id_owner()
returns trigger
language plpgsql
as $$
begin
  if new.avatar_public_id is not null
     and (tg_op = 'INSERT'
          or new.avatar_public_id is distinct from old.avatar_public_id)
     and new.avatar_public_id not like ('user_profiles/' || new.id::text || '/%')
  then
    raise exception
      'avatar_public_id must sit under this user''s own user_profiles/<id>/ folder'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_user_info_avatar_owner
  before insert or update on public.user_info
  for each row
  execute function public.enforce_avatar_public_id_owner();
