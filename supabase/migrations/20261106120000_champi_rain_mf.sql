-- Pluie mesurée par Météo-France (API « Données climatologiques », clé dans le secret METEOFRANCE_API_KEY
-- de la fonction champi-meteo). Relevé chaque nuit, lu par les membres de la famille.
create table public.champi_rain_stations (
  id text primary key,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  alt integer,
  fetched_on date                       -- dernier relevé réussi
);
create table public.champi_rain_daily (
  station_id text not null references public.champi_rain_stations (id) on delete cascade,
  day date not null,
  rr real not null check (rr >= 0),     -- pluie du jour en mm
  primary key (station_id, day)
);
create index champi_rain_daily_day_idx on public.champi_rain_daily (day);
alter table public.champi_rain_stations enable row level security;
alter table public.champi_rain_daily enable row level security;
create policy "champi_rain_stations: la famille lit" on public.champi_rain_stations for select to authenticated
  using ((select champi_private.is_family()));
create policy "champi_rain_daily: la famille lit" on public.champi_rain_daily for select to authenticated
  using ((select champi_private.is_family()));
revoke all on public.champi_rain_stations, public.champi_rain_daily from anon, authenticated;
grant select on public.champi_rain_stations, public.champi_rain_daily to authenticated;

-- Relevé de nuit : toutes les 2 minutes de 3 h à 3 h 58 UTC (4 h-5 h à Paris en hiver), 12 stations par appel
-- (limite Météo-France : 50 requêtes par minute). Fini bien avant les alertes du matin (6 h 37 UTC).
select cron.schedule(
  'champi-meteo-pluie',
  '*/2 3 * * *',
  $job$
  select net.http_post(
    url := 'https://vvegujltsjgwszeloyaz.supabase.co/functions/v1/champi-meteo',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-champi-token', (select cron_token from public.champi_push_config)),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 110000
  );
  $job$
);

-- Date du dernier rafraîchissement de la liste des stations.
alter table public.champi_push_config add column rain_stations_on date;
