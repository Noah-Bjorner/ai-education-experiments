create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (
    display_name is null or char_length(display_name) between 1 and 200
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscription_entitlements (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  product_id text not null,
  status text not null check (
    status in (
      'active',
      'trialing',
      'grace_period',
      'billing_retry',
      'expired',
      'revoked'
    )
  ),
  expires_at timestamptz,
  original_transaction_id text unique,
  environment text not null default 'production' check (
    environment in ('sandbox', 'production')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  method text not null check (char_length(method) between 1 and 16),
  path text not null check (char_length(path) between 1 and 500),
  response_status integer not null check (response_status between 100 and 599),
  created_at timestamptz not null default now()
);

create index request_logs_user_created_at_idx
  on public.request_logs (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.request_logs enable row level security;

alter table public.profiles force row level security;
alter table public.subscription_entitlements force row level security;
alter table public.request_logs force row level security;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy subscription_entitlements_select_own
  on public.subscription_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.profiles from anon, authenticated;
revoke all on public.subscription_entitlements from anon, authenticated;
revoke all on public.request_logs from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.subscription_entitlements to authenticated;

grant all on public.profiles to service_role;
grant all on public.subscription_entitlements to service_role;
grant all on public.request_logs to service_role;

create function private.sync_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');

  insert into public.profiles (id, display_name)
  values (new.id, profile_name)
  on conflict (id) do update
  set
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.sync_user_profile() from public, anon, authenticated;

create trigger on_auth_user_profile_synced
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function private.sync_user_profile();

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger subscription_entitlements_set_updated_at
  before update on public.subscription_entitlements
  for each row execute function private.set_updated_at();

insert into public.profiles (id, display_name)
select
  id,
  nullif(trim(raw_user_meta_data ->> 'full_name'), '')
from auth.users
on conflict (id) do nothing;
