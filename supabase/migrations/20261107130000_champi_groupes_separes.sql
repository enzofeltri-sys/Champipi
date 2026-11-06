-- Famille et amis séparés : chaque groupe ne voit que ses coins et ses prénoms ; seul l'admin voit les deux.
--   👪 Famille : la famille (l'admin en fait partie).   👥 Amis : les amis et l'admin.
create or replace function champi_private.my_group() returns text
  language sql stable security definer set search_path = '' as $$
  select a.grp from public.champi_allowed_emails a
  where a.email = lower(coalesce((select auth.jwt()) ->> 'email', ''));
$$;
create or replace function champi_private.group_of(p_user uuid) returns text
  language sql stable security definer set search_path = '' as $$
  select a.grp from auth.users u join public.champi_allowed_emails a on a.email = lower(u.email) where u.id = p_user;
$$;
create or replace function champi_private.user_is_admin(p_user uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join public.champi_admins a on a.email = lower(u.email) where u.id = p_user);
$$;
-- Même « monde » : soi-même, l'admin (présent dans les deux groupes), ou une personne du même groupe.
create or replace function champi_private.same_world(p_user uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid())
    or champi_private.is_admin()
    or champi_private.user_is_admin(p_user)
    or champi_private.group_of(p_user) = champi_private.my_group();
$$;
revoke all on function champi_private.my_group(), champi_private.group_of(uuid), champi_private.user_is_admin(uuid), champi_private.same_world(uuid) from public, anon;
grant execute on function champi_private.my_group(), champi_private.group_of(uuid), champi_private.user_is_admin(uuid), champi_private.same_world(uuid) to authenticated;

drop policy if exists "champi_spots: lire siens, famille et partagés" on public.champi_spots;
create policy "champi_spots: lire siens, famille et partagés" on public.champi_spots for select to authenticated
  using (owner = (select auth.uid()) or ((select champi_private.is_family()) and (
    (visibility = 'family' and (select champi_private.in_family_group()))
    or (visibility = 'friends' and ((select champi_private.my_group()) = 'ami' or (select champi_private.is_admin())))
    or champi_private.shared_with_me(id))));

drop policy if exists "champi_spots: la famille peut créer" on public.champi_spots;
create policy "champi_spots: la famille peut créer" on public.champi_spots for insert to authenticated
  with check (owner = (select auth.uid()) and (select champi_private.is_family())
    and (visibility <> 'family' or (select champi_private.in_family_group()))
    and (visibility <> 'friends' or (select champi_private.my_group()) = 'ami' or (select champi_private.is_admin())));

drop policy if exists "champi_spots: le créateur modifie" on public.champi_spots;
create policy "champi_spots: le créateur modifie" on public.champi_spots for update to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid())
    and (visibility <> 'family' or (select champi_private.in_family_group()))
    and (visibility <> 'friends' or (select champi_private.my_group()) = 'ami' or (select champi_private.is_admin())));

-- Prénoms : seulement ceux de son groupe (et l'admin) ; l'admin voit tout le monde.
drop policy if exists "champi_profiles: la famille lit les prénoms" on public.champi_profiles;
create policy "champi_profiles: la famille lit les prénoms" on public.champi_profiles for select to authenticated
  using (id = (select auth.uid()) or ((select champi_private.is_family()) and champi_private.same_world(id)));

-- Partager un coin : seulement avec quelqu'un de son groupe (ou l'admin).
drop policy if exists "champi_spot_shares: le créateur partage" on public.champi_spot_shares;
create policy "champi_spot_shares: le créateur partage" on public.champi_spot_shares for insert to authenticated
  with check ((select champi_private.owns_spot(champi_spot_shares.spot_id)) and (select champi_private.is_family())
    and user_id <> (select auth.uid()) and champi_private.same_world(user_id));
