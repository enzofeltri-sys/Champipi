-- Journal : chacun peut relire les alertes « conditions favorables » qu'il a reçues (lecture seule).
create policy "champi_alert_log: lire les siennes" on public.champi_alert_log for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.champi_alert_log to authenticated;
