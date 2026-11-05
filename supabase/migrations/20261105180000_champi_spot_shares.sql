-- Partager un coin (privé) avec une personne précise de la famille.
-- (Appliquée à la main dans l'éditeur SQL ; noms de règles raccourcis à 63 caractères max.)

create table public.champi_spot_shares (
  spot_id uuid not null references public.champi_spots (id) on delete cascade,
  user_id uuid not null references public.champi_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (spot_id, user_id)
);
create index champi_spot_shares_user_idx on public.champi_spot_shares (user_id);
alter table public.champi_spot_shares enable row level security;

-- Fonctions d'aide (security definer) : évitent que les règles des coins et des partages se citent en boucle.
create or replace function champi_private.owns_spot(p_spot uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.champi_spots s where s.id = p_spot and s.owner = (select auth.uid()));
$$;
create or replace function champi_private.shared_with_me(p_spot uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.champi_spot_shares h where h.spot_id = p_spot and h.user_id = (select auth.uid()));
$$;
revoke all on function champi_private.owns_spot(uuid), champi_private.shared_with_me(uuid) from public, anon;
grant execute on function champi_private.owns_spot(uuid), champi_private.shared_with_me(uuid) to authenticated;

create policy "champi_spot_shares: créateur et destinataire lisent"
  on public.champi_spot_shares for select to authenticated
  using (user_id = (select auth.uid()) or (select champi_private.owns_spot(spot_id)));
create policy "champi_spot_shares: le créateur partage"
  on public.champi_spot_shares for insert to authenticated
  with check ((select champi_private.owns_spot(spot_id)) and (select champi_private.is_family())
              and user_id <> (select auth.uid()));
create policy "champi_spot_shares: créateur ou destinataire retire"
  on public.champi_spot_shares for delete to authenticated
  using (user_id = (select auth.uid()) or (select champi_private.owns_spot(spot_id)));

revoke all on public.champi_spot_shares from anon, authenticated;
grant select, insert, delete on public.champi_spot_shares to authenticated;

-- Lecture des coins : on ajoute « partagé avec moi » (et toujours membre de la famille).
drop policy "champi_spots: lire les siens et ceux de la famille" on public.champi_spots;
create policy "champi_spots: lire siens, famille et partagés"
  on public.champi_spots for select to authenticated
  using (owner = (select auth.uid())
         or ((select champi_private.is_family())
             and (visibility = 'family' or champi_private.shared_with_me(id))));
