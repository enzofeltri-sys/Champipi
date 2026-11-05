-- Photos et détails des coins / trouvailles.

-- 1. Détails ------------------------------------------------------------------
alter table public.champi_spots
  add column trees text[] not null default '{}',
  add column soil text check (soil in ('calcaire', 'siliceux', 'mixte')),
  add column exposure text check (exposure in ('N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO')),
  add column access text check (char_length(access) <= 1000),
  add column altitude integer check (altitude between -500 and 5000);

alter table public.champi_finds
  add column quantity text check (quantity in ('quelques', 'panier', 'abondant')),
  add column condition text check (condition in ('jeunes', 'a-point', 'vieux')),
  add column weather text check (char_length(weather) <= 300);

-- 2. Photos (métadonnées) -----------------------------------------------------
-- Fichiers dans le bucket privé champi-photos, chemin « <spot_id>/<uuid>.jpg »
-- (+ miniature « <spot_id>/<uuid>_t.jpg »).
create table public.champi_photos (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.champi_spots (id) on delete cascade,
  find_id uuid references public.champi_finds (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.champi_profiles (id) on delete cascade,
  path text not null unique,
  created_at timestamptz not null default now(),
  check (path like spot_id::text || '/%')
);
create index champi_photos_spot_idx on public.champi_photos (spot_id);
create index champi_photos_find_idx on public.champi_photos (find_id);
create index champi_photos_user_idx on public.champi_photos (user_id);
alter table public.champi_photos enable row level security;

create policy "champi_photos: lire si le coin est visible"
  on public.champi_photos for select to authenticated
  using (exists (select 1 from public.champi_spots s where s.id = spot_id));
-- Photo de trouvaille : par l'auteur de la trouvaille ; photo du coin : par le créateur du coin.
create policy "champi_photos: ajouter"
  on public.champi_photos for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.champi_spots s where s.id = spot_id)
    and (
      (find_id is null and exists (select 1 from public.champi_spots s where s.id = spot_id and s.owner = (select auth.uid())))
      or exists (select 1 from public.champi_finds f where f.id = find_id and f.spot_id = champi_photos.spot_id and f.user_id = (select auth.uid()))
    )
  );
create policy "champi_photos: supprimer les siennes"
  on public.champi_photos for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.champi_photos from anon, authenticated;
grant select, insert, delete on public.champi_photos to authenticated;

-- 3. Stockage -----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('champi-photos', 'champi-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- Le 1er dossier du chemin est l'identifiant du coin ; la sous-requête passe par la RLS de champi_spots.
create policy "champi-photos: lire si le coin est visible"
  on storage.objects for select to authenticated
  using (bucket_id = 'champi-photos'
         and exists (select 1 from public.champi_spots s where s.id::text = (storage.foldername(name))[1]));
create policy "champi-photos: envoyer sur un coin visible"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'champi-photos'
              and (select champi_private.is_family())
              and exists (select 1 from public.champi_spots s where s.id::text = (storage.foldername(name))[1]));
-- Supprimer : ses propres fichiers, ou tout fichier d'un coin dont on est le créateur (suppression du coin).
create policy "champi-photos: supprimer"
  on storage.objects for delete to authenticated
  using (bucket_id = 'champi-photos'
         and (owner_id = (select auth.uid())::text
              or exists (select 1 from public.champi_spots s
                         where s.id::text = (storage.foldername(name))[1] and s.owner = (select auth.uid()))));
