-- Logo de chaque personne : un emblème (emoji) sur un fond de couleur, choisis dans l'appli.
alter table public.champi_profiles
  add column avatar_emoji text check (char_length(avatar_emoji) <= 16),
  add column avatar_color text check (avatar_color ~ '^#[0-9a-f]{6}$');
