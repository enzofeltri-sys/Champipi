-- 🐆 Grrr : un 3ᵉ groupe séparé. Ses membres ne voient que leurs coins (🔒 Moi seul, et ce qu'on leur partage)
-- et les coins 🐆 Grrr ; ni la famille ni les amis ne les voient. L'admin voit les trois groupes.
alter table public.champi_allowed_emails drop constraint if exists champi_allowed_emails_grp_check;
alter table public.champi_allowed_emails add constraint champi_allowed_emails_grp_check check (grp in ('famille', 'ami', 'grrr'));
alter table public.champi_spots drop constraint if exists champi_spots_visibility_check;
alter table public.champi_spots add constraint champi_spots_visibility_check check (visibility in ('private', 'family', 'friends', 'grrr'));

alter policy "champi_spots: lire siens, famille et partagés" on public.champi_spots
  using (owner = (select auth.uid()) or ((select champi_private.is_family()) and (
    (visibility = 'family' and (select champi_private.in_family_group()))
    or (visibility = 'friends' and ((select champi_private.my_group()) = 'ami' or (select champi_private.is_admin())))
    or (visibility = 'grrr' and ((select champi_private.my_group()) = 'grrr' or (select champi_private.is_admin())))
    or champi_private.shared_with_me(id))));

alter policy "champi_spots: la famille peut créer" on public.champi_spots
  with check (owner = (select auth.uid()) and (select champi_private.is_family())
    and (visibility <> 'family' or (select champi_private.in_family_group()))
    and (visibility <> 'friends' or (select champi_private.my_group()) = 'ami' or (select champi_private.is_admin()))
    and (visibility <> 'grrr' or (select champi_private.my_group()) = 'grrr' or (select champi_private.is_admin())));

alter policy "champi_spots: le créateur modifie" on public.champi_spots
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid())
    and (visibility <> 'family' or (select champi_private.in_family_group()))
    and (visibility <> 'friends' or (select champi_private.my_group()) = 'ami' or (select champi_private.is_admin()))
    and (visibility <> 'grrr' or (select champi_private.my_group()) = 'grrr' or (select champi_private.is_admin())));
-- Prénoms et partages : same_world() compare déjà les groupes, rien à changer.
