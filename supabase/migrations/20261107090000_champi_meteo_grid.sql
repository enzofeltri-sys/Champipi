-- Météo de toute la région calculée sur le serveur (grille de 0,1° ≈ 11 km sur PACA), toutes les 6 heures :
-- les téléphones lisent cette grille dans la base au lieu d'interroger Open-Meteo chacun de leur côté
-- (Open-Meteo gratuit : moins de 10 000 appels par jour et par adresse, chaque point comptant pour un appel).
create table public.champi_meteo_grid (
  key text primary key,                 -- « i:j » = floor(lat / 0,1) : floor(lon / 0,1)
  lat double precision not null,
  lon double precision not null,
  elevation real,
  daily jsonb not null,                 -- time, precipitation_sum, temperature_2m_max/min, soil_temperature_0_to_7cm_mean, soil_moisture_0_to_7cm_mean
  updated_at timestamptz not null default now()
);
alter table public.champi_meteo_grid enable row level security;
create policy "champi_meteo_grid: la famille lit" on public.champi_meteo_grid for select to authenticated
  using ((select champi_private.is_family()));
revoke all on public.champi_meteo_grid from anon, authenticated;
grant select on public.champi_meteo_grid to authenticated;

select cron.schedule(
  'champi-meteo-grille',
  '41,43,45 */6 * * *',   -- 3 passages de 150 cases (limite Open-Meteo par minute)
  $job$
  select net.http_post(
    url := 'https://vvegujltsjgwszeloyaz.supabase.co/functions/v1/champi-meteo',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-champi-token', (select cron_token from public.champi_push_config)),
    body := '{"action":"grid"}'::jsonb,
    timeout_milliseconds := 140000
  );
  $job$
);
