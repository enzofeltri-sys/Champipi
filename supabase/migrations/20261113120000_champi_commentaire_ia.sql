-- Commentaire automatique de chaque sortie (trouvaille ou bredouille), écrit par l'IA (Groq) à partir des seules données
-- de l'appli (pluie, sol, avis), sans identification de champignon. Rempli par champi-alertes (action « news »).
alter table public.champi_finds add column if not exists ai_comment text;

-- Le déclencheur part maintenant pour toutes les sorties ; champi-alertes n'envoie pas de notification pour une bredouille.
drop trigger if exists champi_finds_announce on public.champi_finds;
create trigger champi_finds_announce after insert on public.champi_finds
  for each row execute function champi_private.announce_find();
