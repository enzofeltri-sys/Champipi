-- Carnet de champignons — schéma, préfixé champi_ (hébergé dans le projet Supabase « Garmin »).

-- Schéma privé (non exposé par l'API) pour les fonctions d'aide aux règles RLS.
create schema if not exists champi_private;
revoke all on schema champi_private from public, anon;
grant usage on schema champi_private to authenticated;

-- 1. Liste des personnes autorisées ------------------------------------------
create table public.champi_allowed_emails (
  email text primary key check (email = lower(btrim(email)) and email like '%@%')
);
alter table public.champi_allowed_emails enable row level security;

-- is_family() : l'e-mail du JWT est-il dans la liste ?
create or replace function champi_private.is_family()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.champi_allowed_emails a
    where a.email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
$$;
revoke all on function champi_private.is_family() from public, anon;
grant execute on function champi_private.is_family() to authenticated;

-- Chacun peut seulement vérifier sa propre ligne (pour savoir s'il est autorisé).
create policy "champi_allowed_emails: lire sa propre ligne"
  on public.champi_allowed_emails for select to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')));

-- 2. Profils -----------------------------------------------------------------
create table public.champi_profiles (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.champi_profiles enable row level security;

create policy "champi_profiles: la famille lit les prénoms"
  on public.champi_profiles for select to authenticated
  using (id = (select auth.uid()) or (select champi_private.is_family()));
create policy "champi_profiles: créer son profil"
  on public.champi_profiles for insert to authenticated
  with check (id = (select auth.uid()) and (select champi_private.is_family()));
create policy "champi_profiles: modifier son profil"
  on public.champi_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 3. Coins -------------------------------------------------------------------
create table public.champi_spots (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.champi_profiles (id) on delete cascade,
  visibility text not null default 'private' check (visibility in ('private', 'family')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  species text[] not null default '{}',
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index champi_spots_owner_idx on public.champi_spots (owner);
alter table public.champi_spots enable row level security;

create or replace function champi_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.owner := old.owner;          -- le propriétaire ne change jamais
  new.created_at := old.created_at;
  return new;
end;
$$;
revoke all on function champi_private.touch_updated_at() from public, anon, authenticated;
create trigger champi_spots_touch before update on public.champi_spots
  for each row execute function champi_private.touch_updated_at();

create policy "champi_spots: lire les siens et ceux de la famille"
  on public.champi_spots for select to authenticated
  using (owner = (select auth.uid())
         or (visibility = 'family' and (select champi_private.is_family())));
create policy "champi_spots: la famille peut créer"
  on public.champi_spots for insert to authenticated
  with check (owner = (select auth.uid()) and (select champi_private.is_family()));
create policy "champi_spots: le créateur modifie"
  on public.champi_spots for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "champi_spots: le créateur supprime"
  on public.champi_spots for delete to authenticated
  using (owner = (select auth.uid()));

-- 4. Trouvailles -------------------------------------------------------------
create table public.champi_finds (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.champi_spots (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.champi_profiles (id) on delete cascade,
  found_on date not null default current_date,
  species text[] not null default '{}',
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index champi_finds_spot_idx on public.champi_finds (spot_id);
create index champi_finds_user_idx on public.champi_finds (user_id);
alter table public.champi_finds enable row level security;

-- « coin visible » = la sous-requête passe elle-même par la RLS de champi_spots.
create policy "champi_finds: lire si le coin est visible"
  on public.champi_finds for select to authenticated
  using (exists (select 1 from public.champi_spots s where s.id = spot_id));
create policy "champi_finds: ajouter sur un coin visible"
  on public.champi_finds for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.champi_spots s where s.id = spot_id));
create policy "champi_finds: supprimer les siennes"
  on public.champi_finds for delete to authenticated
  using (user_id = (select auth.uid()));

-- 5. Droits : rien pour anon, le strict nécessaire pour authenticated --------
revoke all on public.champi_allowed_emails, public.champi_profiles,
              public.champi_spots, public.champi_finds from anon, authenticated;
grant select on public.champi_allowed_emails to authenticated;
grant select, insert, update on public.champi_profiles to authenticated;
grant select, insert, update, delete on public.champi_spots to authenticated;
grant select, insert, delete on public.champi_finds to authenticated;
