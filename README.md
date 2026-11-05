# Champipi — Carnet de champignons

Nos coins à champignons en Provence (Aix, Marseille, Var, Luberon), privés ou partagés avec la famille.
Site : **https://enzofeltri-sys.github.io/champipi/**

- Site statique (`site/`) : HTML/CSS/JS sans framework, carte Leaflet avec fonds IGN Géoplateforme (Plan IGN v2, photos aériennes) et OpenTopoMap en secours.
- Connexion par lien magique (Supabase Auth), données dans Supabase (tables `champi_*` du projet « Garmin »), protégées par RLS.
- La clé dans `site/js/config.js` est la clé **publishable** (faite pour le navigateur). Ne jamais mettre la clé `service_role` / secrète dans ce dépôt.

## Ajouter un membre de la famille

Dans Supabase → projet **Garmin** → *SQL Editor* :

```sql
insert into public.champi_allowed_emails (email) values ('prenom@exemple.fr');
```

L'adresse doit être **en minuscules**. La personne ouvre le site, saisit son e-mail, touche le lien reçu, puis donne son prénom.
Retirer quelqu'un : `delete from public.champi_allowed_emails where email = 'prenom@exemple.fr';` (il ne verra plus les coins famille ; ses propres coins restent à lui).

Voir la liste : `select * from public.champi_allowed_emails;`

## Mettre à jour le site

Modifier les fichiers de `site/`, puis :

```sh
npm test          # tests de la logique (calendrier, coordonnées, filtres)
git commit -am "…" && git push origin main
```

L'Action *Déployer sur GitHub Pages* relance les tests et publie le site (1 à 2 min).
Si l'appli installée sur le téléphone garde l'ancienne version, la fermer et la rouvrir.
Pour une modification du cache hors ligne, augmenter `VERSION` dans `site/sw.js`.

## Base de données

Les migrations sont dans `supabase/migrations/`. Règles (RLS) :

- coins : lecture si c'est le mien, ou s'il est « Famille » et que je suis dans la liste ; création réservée à la liste ; modification et suppression par le créateur ;
- trouvailles : lecture et ajout si le coin m'est visible ; suppression de mes propres trouvailles ;
- une personne connectée hors de la liste ne voit rien et a un message clair.

## Tester en local

```sh
cd site && python3 -m http.server 5173   # puis http://localhost:5173
node tools/ui-mock.cjs http://localhost:5173/ shots   # parcours Chromium avec une fausse base
```

## Sécurité

Faire contrôler chaque récolte par un pharmacien ou une association mycologique.
Centre antipoison de Marseille : **04 91 75 25 25**.
