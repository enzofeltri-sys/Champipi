-- Administration : Enzo accepte les demandes d'accès et gère la liste de la famille depuis l'appli.

-- 1. Admins -------------------------------------------------------------------
create table public.champi_admins (
  email text primary key check (email = lower(btrim(email)))
);
alter table public.champi_admins enable row level security;
create policy "champi_admins: lire sa propre ligne"
  on public.champi_admins for select to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')));
revoke all on public.champi_admins from anon, authenticated;
grant select on public.champi_admins to authenticated;

insert into public.champi_admins (email) values ('enzofeltri@gmail.com');

create or replace function champi_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.champi_admins a
    where a.email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
$$;
revoke all on function champi_private.is_admin() from public, anon;
grant execute on function champi_private.is_admin() to authenticated;

-- 2. Liste de la famille : l'admin la gère ------------------------------------
alter table public.champi_allowed_emails
  add column label text check (char_length(label) <= 40),
  add column added_at timestamptz not null default now();

create policy "champi_allowed_emails: l'admin lit tout"
  on public.champi_allowed_emails for select to authenticated
  using ((select champi_private.is_admin()));
create policy "champi_allowed_emails: l'admin ajoute"
  on public.champi_allowed_emails for insert to authenticated
  with check ((select champi_private.is_admin()));
create policy "champi_allowed_emails: l'admin retire (pas lui-même)"
  on public.champi_allowed_emails for delete to authenticated
  using ((select champi_private.is_admin())
         and email <> lower(coalesce((select auth.jwt()) ->> 'email', '')));
grant insert, delete on public.champi_allowed_emails to authenticated;

-- Les admins font toujours partie de la famille.
insert into public.champi_allowed_emails (email, label) values ('enzofeltri@gmail.com', 'Enzo')
on conflict (email) do update set label = excluded.label;

-- 3. Demandes d'accès ----------------------------------------------------------
create table public.champi_access_requests (
  email text primary key default lower(coalesce(auth.jwt() ->> 'email', ''))
    check (email = lower(btrim(email)) and email like '%@%'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  message text check (char_length(message) <= 300),
  created_at timestamptz not null default now()
);
create index champi_access_requests_user_idx on public.champi_access_requests (user_id);
alter table public.champi_access_requests enable row level security;

create policy "champi_access_requests: lire la sienne, l'admin lit tout"
  on public.champi_access_requests for select to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')) or (select champi_private.is_admin()));
create policy "champi_access_requests: demander pour soi"
  on public.champi_access_requests for insert to authenticated
  with check (email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
              and user_id = (select auth.uid())
              and not (select champi_private.is_family()));
create policy "champi_access_requests: annuler la sienne, l'admin traite"
  on public.champi_access_requests for delete to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')) or (select champi_private.is_admin()));

revoke all on public.champi_access_requests from anon, authenticated;
grant select, insert, delete on public.champi_access_requests to authenticated;
