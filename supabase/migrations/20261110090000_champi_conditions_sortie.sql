-- Conditions météo relevées pour chaque sortie (trouvaille ou bredouille), remplies par la tournée du matin :
-- pluie 10 / 30 jours, délai depuis la dernière grosse pluie, températures, sol… Servira à caler les seuils.
alter table public.champi_finds add column if not exists conditions jsonb;

-- Humidité habituelle du sol par case de 0,1° et par mois (modèle Open-Meteo, saisons 2022–2025) :
-- déciles, pour dire « plus humide que 70 % des jours d'octobre ici ». Calculée la nuit par champi-meteo.
create table if not exists public.champi_soil_clim (
  key text primary key,
  months jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.champi_soil_clim enable row level security;
create policy "champi_soil_clim: la famille lit" on public.champi_soil_clim for select to authenticated
  using ((select champi_private.is_family()));
revoke all on public.champi_soil_clim from anon, authenticated;
grant select on public.champi_soil_clim to authenticated;

-- Grille : 4 passages de 120 cases (31 jours de pluie comptent plus cher chez Open-Meteo).
select cron.alter_job((select jobid from cron.job where jobname = 'champi-meteo-grille'), schedule := '41,43,45,47 */6 * * *');
