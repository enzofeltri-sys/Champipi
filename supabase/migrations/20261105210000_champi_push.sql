-- Alertes de pousse (notifications Web Push).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Abonnements des téléphones (un par navigateur / appli installée).
create table public.champi_push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%'),
  user_id uuid not null default auth.uid() references public.champi_profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index champi_push_subscriptions_user_idx on public.champi_push_subscriptions (user_id);
alter table public.champi_push_subscriptions enable row level security;
create policy "champi_push: lire les siens" on public.champi_push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "champi_push: s'abonner" on public.champi_push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()) and (select champi_private.is_family()));
create policy "champi_push: se désabonner" on public.champi_push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.champi_push_subscriptions from anon, authenticated;
grant select, insert, delete on public.champi_push_subscriptions to authenticated;

-- Alertes déjà envoyées (pour ne pas répéter la même alerte chaque matin). Lu et écrit par la fonction seulement.
create table public.champi_alert_log (
  spot_id uuid not null references public.champi_spots (id) on delete cascade,
  user_id uuid not null references public.champi_profiles (id) on delete cascade,
  sent_on date not null default current_date,
  primary key (spot_id, user_id, sent_on)
);
create index champi_alert_log_user_idx on public.champi_alert_log (user_id);
alter table public.champi_alert_log enable row level security;
revoke all on public.champi_alert_log from anon, authenticated;

-- Configuration privée de la fonction : clés VAPID (générées par la fonction) et jeton du planificateur.
-- Aucun accès pour anon / authenticated ; seule la fonction (clé de service) et le planificateur (postgres) la lisent.
create table public.champi_push_config (
  id boolean primary key default true check (id),
  vapid_public text,
  vapid_private text,
  cron_token text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
alter table public.champi_push_config enable row level security;
revoke all on public.champi_push_config from anon, authenticated;
insert into public.champi_push_config (id) values (true);
