-- 3FS production authentication, roles and live shared data
-- Run this entire file in Supabase SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '3FS Team Member',
  role text not null default 'admin' check (role = 'admin'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.current_3fs_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() and is_active $$;
create or replace function public.current_3fs_active() returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select is_active from public.profiles where id=auth.uid()),false) $$;

-- These helper functions are internal policy helpers, not public API endpoints.
revoke execute on function public.current_3fs_role() from public, anon, authenticated;
revoke execute on function public.current_3fs_active() from public, anon, authenticated;
drop policy if exists "profiles self read" on public.profiles;
drop policy if exists "admin read profiles" on public.profiles;
drop policy if exists "admin update profiles" on public.profiles;
drop policy if exists "admin insert profiles" on public.profiles;
create policy "3fs authenticated profile read" on public.profiles for select to authenticated using (id=auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,full_name,role,is_active)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name','3FS Team Member'),'admin',true)
  on conflict(id) do update set email=excluded.email, full_name=excluded.full_name;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table if not exists public.threefs_state (
  id bigint primary key check (id=1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.threefs_state enable row level security;
drop policy if exists "team can read 3fs state" on public.threefs_state;
drop policy if exists "team can insert 3fs state" on public.threefs_state;
drop policy if exists "team can update 3fs state" on public.threefs_state;
drop policy if exists "managers can insert 3fs state" on public.threefs_state;
drop policy if exists "managers can update 3fs state" on public.threefs_state;
drop policy if exists "3fs authenticated read" on public.threefs_state;
drop policy if exists "3fs authenticated insert" on public.threefs_state;
drop policy if exists "3fs authenticated update" on public.threefs_state;
create policy "3fs authenticated read" on public.threefs_state for select to authenticated using (id=1);
create policy "3fs authenticated insert" on public.threefs_state for insert to authenticated with check (id=1);
create policy "3fs authenticated update" on public.threefs_state for update to authenticated using (id=1) with check (id=1);

alter table public.threefs_state replica identity full;
do $$ begin alter publication supabase_realtime add table public.threefs_state; exception when duplicate_object then null; end $$;
create index if not exists idx_threefs_state_updated_by on public.threefs_state(updated_by);

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- V4: atomic fast-save RPC. The website sends only changed top-level sections,
-- avoiding the old read-then-write round trip.
create or replace function public.threefs_merge_state(p_patch jsonb)
returns public.threefs_state
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.threefs_state;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id=auth.uid() and is_active=true) then raise exception '3FS account is not active'; end if;
  insert into public.threefs_state(id,data,updated_at,updated_by)
  values (1,coalesce(p_patch,'{}'::jsonb),now(),auth.uid())
  on conflict (id) do update set data=public.threefs_state.data || excluded.data,updated_at=now(),updated_by=auth.uid()
  returning * into v_row;
  return v_row;
end; $$;
revoke all on function public.threefs_merge_state(jsonb) from public;
grant execute on function public.threefs_merge_state(jsonb) to authenticated;


-- Anonymous sign-in is enabled in Supabase Auth project settings, not by SQL.
-- After enabling Anonymous Sign-Ins, anonymous users receive the authenticated role,
-- and the policies above allow active 3FS profiles to read/write the shared state.
