-- « Passé, rien trouvé » : une visite sans cueillette, gardée comme une trouvaille vide (empty = true).
-- Elle sert au conseiller (rien il y a 2 jours → avis plus prudent) ; elle n'est pas annoncée à la famille.
alter table public.champi_finds add column if not exists empty boolean not null default false;
drop trigger if exists champi_finds_announce on public.champi_finds;
create trigger champi_finds_announce after insert on public.champi_finds
  for each row when (not new.empty) execute function champi_private.announce_find();
