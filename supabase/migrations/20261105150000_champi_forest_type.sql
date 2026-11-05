-- Type de forêt IGN (BD Forêt V2) lu automatiquement à l'emplacement du coin.
alter table public.champi_spots
  add column forest_type text check (char_length(forest_type) <= 150);
