-- Indice d'humidité des sols de Météo-France (SIM / Safran-Isba, mailles de ~8 km, réserve sur ~2 m rapportée à la
-- réserve utile, et sa normale 1991–2020), situation de la veille sur la PACA. Source : service WFS public « données SIM »
-- (Licence Ouverte), relevé chaque matin par champi-meteo.
create table if not exists public.champi_swi (
  key text primary key,          -- identifiant de la maille SIM
  w real not null, s real not null, e real not null, n real not null,   -- emprise (degrés)
  swi real, normal real, rain15 real,
  date date not null,
  updated_at timestamptz not null default now()
);
alter table public.champi_swi enable row level security;
create policy "champi_swi: la famille lit" on public.champi_swi for select to authenticated
  using ((select champi_private.is_family()));
revoke all on public.champi_swi from anon, authenticated;
grant select on public.champi_swi to authenticated;

select cron.schedule('champi-meteo-swi', '13 5,11 * * *', $job$
  select net.http_post(
    url := 'https://vvegujltsjgwszeloyaz.supabase.co/functions/v1/champi-meteo',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-champi-token', (select cron_token from public.champi_push_config)),
    body := '{"action":"swi"}'::jsonb,
    timeout_milliseconds := 60000);
$job$);
