-- Commentaire automatique de l'IA (Groq) sur chaque sortie, trouvaille ou visite bredouille.
alter table public.champi_finds add column if not exists ai_comment text;
-- Le déclencheur part maintenant pour toutes les sorties (avant : seulement les trouvailles).
create or replace trigger champi_finds_announce after insert on public.champi_finds
  for each row execute function champi_private.announce_find();
