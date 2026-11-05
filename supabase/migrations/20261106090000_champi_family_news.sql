-- Nouvelles de la famille : une notification quand quelqu'un note une trouvaille dans un coin
-- que d'autres peuvent voir (coin « famille » ou partagé). Chacun peut couper chaque type d'alerte.
alter table public.champi_profiles
  add column notify_pousse boolean not null default true,
  add column notify_news boolean not null default true;

-- Après chaque trouvaille : la fonction champi-alertes décide à qui l'annoncer (jeton privé du planificateur).
create or replace function champi_private.announce_find() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://vvegujltsjgwszeloyaz.supabase.co/functions/v1/champi-alertes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-champi-token', (select cron_token from public.champi_push_config)),
    body := jsonb_build_object('action', 'news', 'find_id', new.id),
    timeout_milliseconds := 30000
  );
  return new;
end $$;
revoke all on function champi_private.announce_find() from public, anon, authenticated;

create trigger champi_finds_announce after insert on public.champi_finds
  for each row execute function champi_private.announce_find();
