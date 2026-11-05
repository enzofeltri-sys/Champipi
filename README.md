# Champipi — Carnet de champignons

Nos coins à champignons en Provence (Aix, Marseille, Var, Luberon), privés ou partagés avec la famille.
Site : **https://enzofeltri-sys.github.io/Champipi/**

- Site statique (`site/`) : HTML/CSS/JS sans framework, carte Leaflet avec fonds IGN Géoplateforme (Plan IGN v2, photos aériennes) et OpenTopoMap en secours.
- Connexion par lien magique (Supabase Auth), données dans Supabase (tables `champi_*` du projet « Garmin »), protégées par RLS.
- La clé dans `site/js/config.js` est la clé **publishable** (faite pour le navigateur). Ne jamais mettre la clé `service_role` / secrète dans ce dépôt.

## Ajouter un membre de la famille

**Depuis l'appli (admin : enzofeltri@gmail.com)** : menu ☰ → « 👑 Gérer la famille ».
- La personne ouvre le site, se connecte avec son e-mail, donne son prénom et touche « Demander l'accès ».
  Une pastille rouge apparaît sur le menu de l'admin → **Accepter** ou **Refuser**.
- Ou bien l'admin ajoute directement une adresse (+ prénom) : la personne arrive alors directement dans l'appli.
- **Retirer** un membre : il ne voit plus les coins de la famille (ses propres coins restent à lui). L'admin ne peut pas se retirer lui-même.

**En SQL (secours)**, Supabase → projet Garmin → *SQL Editor* :

```sql
insert into public.champi_allowed_emails (email, label) values ('prenom@exemple.fr', 'Prénom');  -- en minuscules
insert into public.champi_admins (email) values ('autre-admin@exemple.fr');                     -- nouvel admin
```

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

## Conseiller, météo et forêts

- **🤖 Conseiller du jour** (sous la carte ou dans le menu) : espèces en saison, pluie sur 10 jours en PACA,
  et classement de tes coins (🟢 favorable / 🟡 moyen / 🔴 défavorable / ⚪ hors saison).
- **Fiche d'un coin** : pluie jour par jour sur 10 jours (+ aujourd'hui et prévision hachurée), températures, avis et raisons.
- Les règles sont simples et affichées (`site/js/advisor.js`, testées dans `tests/advisor.test.mjs`) :
  cumul de pluie sur 10 jours, délai depuis la dernière grosse pluie (≥ 15 mm/jour ou ≥ 20 mm sur 2 jours ;
  fenêtre favorable 5 à 15 jours après), gel ou chaleur, mois de pic, arbres du coin, trouvailles passées au même mois.
  **Ce n'est pas une prédiction et aucun champignon n'est identifié.**
- **Carte des pluies PACA** (menu) : ~100 points, une seule requête Open-Meteo (gratuit, sans clé, CC BY 4.0).
- **Forêts IGN** (menu) : BD Forêt® V2 ; le type de forêt sous l'épingle est lu automatiquement (service WMS de l'IGN)
  et propose de cocher les arbres correspondants.
- **📖 Guide des espèces** : saison, milieux, sol, altitude et sosies dangereux (connaissances générales, à confirmer
  auprès d'une association mycologique).

## Apprentissage sur tes trouvailles

- Fiche d'un coin → « 📊 Bilan du coin » : trouvailles par mois et par année, meilleur mois, espèces.
- Dès 3 trouvailles, l'appli récupère la météo réelle des jours qui les ont précédées (archive Open-Meteo, mémorisée)
  et en tire les seuils du coin : pluie minimale sur 14 jours et délai habituel après une grosse pluie.
  L'avis du coin et le conseiller ajoutent alors des lignes « Ton expérience : … » (`site/js/learn.js`, `tests/learn.test.mjs`).
- Avec peu de trouvailles, les seuils restent grossiers : ils s'affinent saison après saison.

## Partager un coin avec une personne

- Sur la fiche d'un coin « Moi seul » : « 🤝 Partager… » → cocher des membres de la famille.
  Ils voient le coin (épingle bleu-vert « Partagé »), son journal et ses photos, et peuvent y noter leurs trouvailles.
  Ils peuvent aussi « Ne plus voir ce coin partagé ». Table `champi_spot_shares`, migration `20261105180000`.

## Hors ligne

- Menu ☰ → « 📥 Cartes hors ligne » : enregistre le Plan IGN de la zone affichée (≤ 1 500 tuiles, zooms jusqu'à 16),
  dans le cache `champi-tuiles-v1` du service worker (`site/sw.js`). Les zones se suppriment depuis le même écran.
- Sans réseau : l'appli s'ouvre sur la dernière copie des données (bandeau « 📴 Hors ligne »), la boussole et le journal
  marchent ; les nouveaux coins et trouvailles (avec photos) attendent dans IndexedDB et partent au retour du réseau
  (`site/js/offline.js`). La modification/suppression d'un coin existant demande le réseau.
- Plan IGN sous Licence Ouverte Etalab ; OpenTopoMap n'est pas enregistré (sa politique l'interdit).

## Accès aux massifs (risque incendie)

- Fiche d'un coin : massif officiel et accès du jour (🟢 autorisé, 🟠 déconseillé, ⛔ interdit), d'après les cartes publiées
  chaque jour par les préfectures 04, 06, 13, 83 et 84 sur risque-prevention-incendie.fr (période réglementée : juin–septembre).
- Contours des massifs : `site/data/massifs-acces.json` (simplifiés à ~300 m depuis les fichiers des préfectures).
- Les niveaux du jour passent par la fonction Supabase `champi-acces` (`supabase/functions/champi-acces`), car le site
  source ne se laisse pas lire directement depuis le navigateur. Elle demande une session connectée.
- Toujours vérifier la carte officielle en cas de doute (lien sur la fiche).

## Photos

- Stockées dans le bucket privé Supabase `champi-photos` (chemin `<id du coin>/<uuid>.jpg` + miniature `_t.jpg`).
  Une photo suit les règles de son coin : invisible si le coin ne t'est pas visible.
- Réduites sur le téléphone avant l'envoi (1600 px, ~250 Ko ; miniature 400 px). La réduction **efface la position GPS** de la photo.
- « Depuis la position d'une photo » lit cette position *avant* réduction pour placer l'épingle (souvent absente sur iPhone).
- Offre gratuite Supabase : 1 Go de fichiers pour tout le projet « Garmin » (≈ 4 000 photos).

## Tester en local

```sh
cd site && python3 -m http.server 5173   # puis http://localhost:5173
node tools/ui-mock.cjs http://localhost:5173/ shots   # parcours Chromium avec une fausse base
node tools/ui-photos.cjs http://localhost:5173/ shots <photo.jpg avec GPS>   # parcours photos et détails
node tools/ui-admin.cjs http://localhost:5173/ shots      # demande d'accès + admin
node tools/ui-advisor.cjs http://localhost:5173/ shots    # conseiller (vraies API Open-Meteo et IGN)
node tools/ui-field.cjs http://localhost:5173/ shots tests/date.jpg   # tutoriel, boussole, recherche, exports
node tools/ui-access.cjs http://localhost:5173/ shots     # accès aux massifs (hors saison et été simulé)
node tools/ui-offline.cjs http://localhost:5173/ shots tests/gps.jpg  # hors ligne (vraies tuiles IGN)
node tools/ui-share.cjs http://localhost:5173/ shots      # partage d'un coin (3 personnes)
node tools/ui-learn.cjs http://localhost:5173/ shots      # bilan et apprentissage (vraie archive ; FAKE_ARCHIVE=1 pour simuler)
```

## Sécurité

Faire contrôler chaque récolte par un pharmacien ou une association mycologique.
Centre antipoison de Marseille : **04 91 75 25 25**.
