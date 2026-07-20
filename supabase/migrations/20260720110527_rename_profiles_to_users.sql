alter table public.profiles rename to users;

alter table public.users rename constraint profiles_pkey to users_pkey;
alter table public.users rename constraint profiles_id_fkey to users_id_fkey;

alter policy profiles_select_own
  on public.users
  rename to users_select_own;

drop policy profiles_update_own on public.users;

alter trigger profiles_set_updated_at
  on public.users
  rename to users_set_updated_at;

alter table public.users
  add column email text,
  drop column display_name;

alter table public.users
  add constraint users_email_length_check check (
    email is null or char_length(email) <= 320
  );

revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;

drop trigger on_auth_user_profile_synced on auth.users;

alter function private.sync_user_profile() rename to sync_user;

create or replace function private.sync_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update
  set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.sync_user() from public, anon, authenticated;

create trigger on_auth_user_synced
  after insert or update of email on auth.users
  for each row execute function private.sync_user();

update public.users as app_user
set
  email = auth_user.email,
  updated_at = now()
from auth.users as auth_user
where app_user.id = auth_user.id;
