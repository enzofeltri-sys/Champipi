-- Groupe « amis » : chaque membre est « famille » ou « ami » ; un coin peut être 🔒 privé, 👪 famille ou 👥 amis.
-- Un ami voit ses coins, les coins 👥 Amis et ceux partagés avec lui ; jamais les coins 👪 Famille.
alter table public.champi_allowed_emails add column if not exists grp text not null default 'famille';
alter table public.champi_allowed_emails drop constraint if exists champi_allowed_emails_grp_check;
alter table public.champi_allowed_emails add constraint champi_allowed_emails_grp_check check (grp in ('famille', 'ami'));

alter table public.champi_spots drop constraint if exists champi_spots_visibility_check;
alter table public.champi_spots add constraint champi_spots_visibility_check check (visibility in ('private', 'family', 'friends'));

-- is_family() reste « membre de l'appli » (famille ou ami) ; in_family_group() = du groupe famille.
create or replace function champi_private.in_family_group() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.champi_allowed_emails a
    where a.email = lower(coalesce((select auth.jwt()) ->> 'email', '')) and a.grp = 'famille'
  );
$$;
revoke all on function champi_private.in_family_group() from public, anon;
grant execute on function champi_private.in_family_group() to authenticated;

drop policy if exists "champi_spots: lire siens, famille et partagés" on public.champi_spots;
create policy "champi_spots: lire siens, famille et partagés" on public.champi_spots for select to authenticated
  using (owner = (select auth.uid()) or ((select champi_private.is_family()) and (
    visibility = 'friends'
    or (visibility = 'family' and (select champi_private.in_family_group()))
    or champi_private.shared_with_me(id))));

drop policy if exists "champi_spots: la famille peut créer" on public.champi_spots;
create policy "champi_spots: la famille peut créer" on public.champi_spots for insert to authenticated
  with check (owner = (select auth.uid()) and (select champi_private.is_family())
    and (visibility <> 'family' or (select champi_private.in_family_group())));

drop policy if exists "champi_spots: le créateur modifie" on public.champi_spots;
create policy "champi_spots: le créateur modifie" on public.champi_spots for update to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()) and (visibility <> 'family' or (select champi_private.in_family_group())));

-- L'admin peut changer le groupe de quelqu'un (pas le sien).
drop policy if exists "champi_allowed_emails: l'admin change le groupe" on public.champi_allowed_emails;
create policy "champi_allowed_emails: l'admin change le groupe" on public.champi_allowed_emails for update to authenticated
  using ((select champi_private.is_admin()) and email <> lower(coalesce((select auth.jwt()) ->> 'email', '')))
  with check ((select champi_private.is_admin()));
