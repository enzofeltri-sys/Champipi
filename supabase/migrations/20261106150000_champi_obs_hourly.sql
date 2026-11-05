-- Observations horaires Météo-France (API « Package Observations ») : pluie du jour en cours et températures
-- mesurées. Mêmes lignes quotidiennes que la climatologie : src = 'clim' (relevé de nuit, données vérifiées,
-- prioritaire) ou 'obs' (cumul des heures déjà passées, mis à jour chaque heure).
alter table public.champi_rain_daily
  alter column rr drop not null,
  add column tn real,                                   -- température mini du jour (°C)
  add column tx real,                                   -- température maxi du jour (°C)
  add column hours smallint,                            -- heures cumulées (24 = journée complète)
  add column src text not null default 'clim' check (src in ('clim', 'obs'));

select cron.schedule(
  'champi-meteo-horaire',
  '25 * * * *',
  $job$
  select net.http_post(
    url := 'https://vvegujltsjgwszeloyaz.supabase.co/functions/v1/champi-meteo',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-champi-token', (select cron_token from public.champi_push_config)),
    body := '{"action":"hourly"}'::jsonb,
    timeout_milliseconds := 110000
  );
  $job$
);
