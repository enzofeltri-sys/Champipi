-- Tournée quotidienne des alertes de pousse (appliquée le 5 nov. 2026 via l'outil SQL).
-- 6 h 37 UTC = 7 h 37 à Paris en hiver, 8 h 37 en été. Le jeton est lu dans champi_push_config au moment de l'appel.
select cron.schedule(
  'champi-alertes-matin',
  '37 6 * * *',
  $job$
  select net.http_post(
    url := 'https://vvegujltsjgwszeloyaz.supabase.co/functions/v1/champi-alertes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-champi-token', (select cron_token from public.champi_push_config)),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
