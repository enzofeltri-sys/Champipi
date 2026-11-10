// Fiches détaillées du guide (connaissances mycologiques générales, à confirmer auprès d'une société mycologique).
// L'appli n'identifie aucun champignon : ces fiches aident à chercher et à se méfier des sosies.
// danger : 3 = mortel, 2 = toxique, 1 = sans danger grave / immangeable.
export const INFO = {
  'lactaire-sanguin': {
    look: [
      ['Chapeau', '5 à 12 cm, orange rosé à rouge vineux, souvent creusé au centre, avec des cercles plus foncés ; tache de vert en vieillissant.'],
      ['Dessous', 'Lames serrées, rose vineux.'],
      ['Lait', 'À la cassure, un lait rouge vineux (« sang ») qui reste rouge : c\'est le signe principal.'],
      ['Pied', 'Court, creux, souvent marqué de petites fossettes.'],
      ['Chair', 'Ferme, cassante ; verdit où elle est abîmée.'],
    ],
    where: 'Pinèdes claires sur calcaire (pin d\'Alep, pin noir), talus et bords de pistes. Pousse souvent en lignes ou en groupes, dans les aiguilles.',
    tips: 'Couper au pied et vérifier les vers à la coupe. Colore l\'urine en rouge : c\'est sans danger.',
    cook: 'Grillé ou à la plancha, ail et persil, ou en poêlée provençale.',
    looks: [
      [2, 'Lactaires à lait blanc (lactaire à toison…)', 'Lait blanc et âcre, chapeau parfois « barbu » : toxiques ou immangeables.'],
      [1, 'Lactaire délicieux', 'Lait orange carotte : comestible aussi.'],
    ],
    wiki: 'Lactarius_sanguifluus',
  },
  'lactaire-delicieux': {
    look: [
      ['Chapeau', '5 à 12 cm, orange carotte, souvent creusé au centre, avec des cercles plus foncés ; taches vertes en vieillissant.'],
      ['Dessous', 'Lames serrées, orange.'],
      ['Lait', 'À la cassure, un lait orange carotte (pas rouge vineux comme le sanguin) : c\'est le signe principal.'],
      ['Pied', 'Court, creux, orange, souvent marqué de fossettes plus foncées.'],
      ['Chair', 'Ferme, cassante ; verdit où elle est abîmée.'],
    ],
    where: 'Sous les pins (pin sylvestre, pin maritime, pin d\'Alep), sur sol acide comme calcaire, souvent dans les jeunes pinèdes et les bords de pistes ; jusqu\'en montagne.',
    tips: 'Moins réputé que le sanguin en Provence, mais bon comestible. Couper au pied et vérifier les vers.',
    cook: 'Grillé ou à la plancha, ou en poêlée avec ail et persil.',
    looks: [
      [2, 'Lactaires à lait blanc (lactaire à toison…)', 'Lait blanc et âcre, chapeau parfois « barbu » : toxiques ou immangeables.'],
      [1, 'Lactaire sanguin', 'Lait rouge vineux : comestible aussi, plus recherché.'],
    ],
    wiki: 'Lactarius_deliciosus',
  },
  'petit-gris': {
    look: [
      ['Chapeau', '3 à 7 cm, gris souris, feutré, souvent avec un petit mamelon.'],
      ['Dessous', 'Lames blanches à grisâtres, espacées.'],
      ['Pied', 'Blanc, fibreux, sans anneau.'],
      ['Chair', 'Mince, blanche, odeur faible.'],
    ],
    where: 'Sous les pins, en troupes nombreuses dans les aiguilles, souvent tard (novembre à janvier).',
    tips: 'Des études ont soulevé un doute sur sa toxicité musculaire en grande quantité : à manger avec modération.',
    cook: 'Poêlé, en omelette ou en sauce.',
    looks: [
      [2, 'Tricholome tigré', 'Plus grand (jusqu\'à 15 cm), écailles nettes en cercles, chair épaisse : toxique (troubles digestifs sévères).'],
      [3, 'Tricholome équestre (bidaou)', 'Jaune, sous les pins aussi : interdit à la vente en France, il a causé des décès (atteinte musculaire).'],
    ],
    wiki: 'Tricholoma_terreum',
  },
  cepe: {
    look: [
      ['Chapeau', '8 à 25 cm, brun clair à brun très foncé (cèpe noir), charnu, lisse.'],
      ['Dessous', 'Pas de lames : une éponge de tubes, blancs puis jaunes puis verdâtres. Ne bleuit pas au toucher.'],
      ['Pied', 'Ventru, clair, avec un fin réseau blanc en haut.'],
      ['Chair', 'Blanche, ferme, ne change pas de couleur ; bonne odeur de champignon.'],
    ],
    where: 'Chênaies (chêne vert, chêne blanc, chêne-liège), châtaigneraies, hêtraies et pinèdes, en lisière et sous-bois clairs. En Provence : cèpe noir sous les chênes chauds, cèpe d\'été en juin, et tard en saison près de la côte.',
    tips: 'Prendre les jeunes, fermes. Enlever les tubes s\'ils sont mous. Panier aéré, jamais de sac plastique.',
    cook: 'Poêlé à l\'ail et au persil, en omelette, ou séché.',
    looks: [
      [1, 'Bolet amer', 'Pores rosés, réseau brun foncé sur le pied, très amer : un seul gâte la poêlée (goûter un bout et recracher).'],
      [2, 'Bolet de Satan', 'Chapeau blanchâtre, pores et pied rouges, chair qui bleuit : toxique. Laisser tous les bolets à pores rouges.'],
    ],
    wiki: 'Cèpe',
  },
  girolle: {
    look: [
      ['Couleur', 'Jaune d\'œuf, de partout.'],
      ['Chapeau', '3 à 10 cm, bord enroulé puis ondulé.'],
      ['Dessous', 'Pas de vraies lames : des plis épais, fourchus, qui descendent sur le pied.'],
      ['Pied', 'Plein, plus fin vers le bas.'],
      ['Chair', 'Blanche, ferme, odeur fruitée d\'abricot.'],
    ],
    where: 'Chênes, châtaigniers et hêtres sur sols acides (Maures, Estérel, Tanneron), mousses et bords de chemins.',
    tips: 'Couper au pied, brosser plutôt que laver.',
    cook: 'Poêlée vive, avec des œufs, ou en accompagnement.',
    looks: [
      [2, 'Clitocybe de l\'olivier', 'Orange vif, vraies lames fines et serrées, pousse en touffes sur souches et racines (olivier, chêne) : toxique, très courant en Provence.'],
      [3, 'Cortinaires orangés', 'Brun orangé, vraies lames, fine toile sous le chapeau jeune : MORTELS (atteinte des reins, symptômes plusieurs jours après).'],
      [1, 'Fausse girolle', 'Orange, vraies lames fines, chair molle, sur conifères : sans intérêt.'],
    ],
    wiki: 'Girolle',
  },
  'pied-de-mouton': {
    look: [
      ['Chapeau', '5 à 15 cm, crème à orangé pâle, irrégulier, bosselé.'],
      ['Dessous', 'Ni lames ni tubes : des petits aiguillons fragiles, comme une barbe.'],
      ['Pied', 'Court, blanc, souvent décentré.'],
      ['Chair', 'Ferme et cassante, blanche ; un peu amère chez les gros.'],
    ],
    where: 'Feuillus et conifères, souvent en cercles ou en lignes ; jusqu\'en hiver les années douces.',
    tips: 'Gratter les aiguillons des gros (amers). Très facile à reconnaître grâce aux aiguillons.',
    cook: 'Blanchi puis poêlé, en sauce ou en terrine.',
    looks: [
      [1, 'Pied-de-mouton roux', 'Plus petit et orangé : comestible aussi.'],
    ],
    wiki: 'Hydnum_repandum',
  },
  trompette: {
    look: [
      ['Forme', 'Une trompette ou un cornet creux jusqu\'à la base, 5 à 12 cm.'],
      ['Couleur', 'Gris foncé à noir à l\'intérieur, gris cendré dehors.'],
      ['Dessous', 'Pas de lames : surface lisse ou à peine ridée.'],
      ['Chair', 'Mince, élastique, odeur fruitée.'],
    ],
    where: 'Feuillus (hêtres, chênes, châtaigniers), sols frais, mousses et feuilles mortes ; souvent en grandes colonies.',
    tips: 'Très difficile à voir dans les feuilles : quand on en trouve une, il y en a d\'autres autour. Bien ouvrir pour nettoyer l\'intérieur.',
    cook: 'En sauce, en omelette, avec des pâtes ; excellente séchée et réduite en poudre.',
    looks: [
      [1, 'Chanterelle sinueuse', 'Grise aussi, avec des plis : comestible.'],
    ],
    wiki: 'Trompette_de_la_mort',
  },
  oronge: {
    look: [
      ['Chapeau', '8 à 20 cm, orange vif, lisse, parfois un lambeau blanc dessus.'],
      ['Dessous', 'Lames JAUNES.'],
      ['Pied', 'JAUNE, avec un anneau jaune et, à la base, un gros sac blanc (volve).'],
      ['Jeune', 'Un « œuf » blanc qui s\'ouvre sur l\'orange.'],
    ],
    where: 'Chênaies et châtaigneraies chaudes sur sols siliceux (Var, Maures), fin d\'été et automne après des orages chauds.',
    tips: 'Réservé aux connaisseurs. Ne JAMAIS ramasser d\'œufs fermés : on ne garde que des exemplaires ouverts, lames et pied nettement jaunes. Vérifier les règles locales de cueillette.',
    cook: 'Cru en fines lamelles ou à peine poêlé.',
    looks: [
      [3, 'Amanite phalloïde (stade œuf)', 'Coupé en deux, l\'œuf montre un chapeau verdâtre ou blanc et des lames blanches : MORTELLE.'],
      [2, 'Amanite tue-mouches', 'Chapeau rouge à flocons blancs, lames et pied BLANCS : toxique.'],
    ],
    wiki: 'Amanite_des_Césars',
  },
  coulemelle: {
    look: [
      ['Chapeau', '10 à 30 cm, crème couvert d\'écailles brunes, mamelon brun au centre.'],
      ['Dessous', 'Lames blanches, libres (ne touchent pas le pied).'],
      ['Pied', 'Haut (15 à 40 cm), chiné de brun, bulbe à la base, anneau double qui COULISSE.'],
      ['Chair', 'Blanche, odeur de noisette.'],
    ],
    where: 'Lisières, clairières, prairies et bords de chemins.',
    tips: 'Ne garder que les grands exemplaires (chapeau de plus de 10 cm) dont l\'anneau coulisse. Ne manger que le chapeau.',
    cook: 'Chapeau pané ou grillé comme une escalope.',
    looks: [
      [3, 'Petites lépiotes', 'Moins de 10 cm, anneau fixe ou absent, souvent rosées ou brunes : MORTELLES.'],
      [2, 'Lépiotes à lames verdissantes', 'Lames qui deviennent vertes : toxiques.'],
    ],
    wiki: 'Lépiote_élevée',
  },
  berigoule: {
    look: [
      ['Chapeau', '3 à 10 cm, gris-brun à crème, creusé, bord enroulé.'],
      ['Dessous', 'Lames blanchâtres qui descendent sur le pied.'],
      ['Pied', 'Court, blanc, souvent décentré.'],
      ['Chair', 'Blanche, ferme, bonne odeur.'],
    ],
    where: 'Friches, pelouses sèches et bords de champs calcaires, sur les racines mortes du panicaut champêtre (le « chardon roulant »). Printemps et automne.',
    tips: 'Gratter au pied : il doit sortir d\'une racine de panicaut. Sans panicaut, s\'abstenir.',
    cook: 'Grillé, en fricassée ou en daube à la provençale.',
    looks: [
      [2, 'Clitocybes blancs', 'Petits champignons blancs des mêmes pelouses, sans panicaut : toxiques (sueurs, malaises).'],
    ],
    wiki: 'Pleurotus_eryngii',
  },
  morille: {
    look: [
      ['Chapeau', 'Une éponge d\'alvéoles CREUSES, conique ou arrondie, blonde à noire.'],
      ['Intérieur', 'Coupée en deux : entièrement creuse, chapeau et pied d\'un seul tenant.'],
      ['Pied', 'Blanc, granuleux.'],
    ],
    where: 'Printemps : bords de rivières (frênes, ormes), vergers, zones brûlées ou remuées.',
    tips: 'Toujours couper en deux pour vérifier qu\'elle est creuse. Toxique crue : toujours bien cuire (20 minutes au moins).',
    cook: 'À la crème, ou farcie ; excellente séchée.',
    looks: [
      [3, 'Gyromitre', 'Chapeau en cervelle (plis, pas d\'alvéoles), intérieur cloisonné : MORTEL.'],
      [2, 'Verpe (morillon)', 'Chapeau en dé posé sur le pied, pied rempli de coton : toxique.'],
    ],
    wiki: 'Morille',
  },
  'saint-georges': {
    look: [
      ['Chapeau', '5 à 15 cm, blanc crème, charnu, bord enroulé.'],
      ['Dessous', 'Lames blanches, très serrées.'],
      ['Pied', 'Trapu, blanc.'],
      ['Odeur', 'Forte odeur de farine fraîche.'],
    ],
    where: 'Prairies, haies et lisières, en ronds de sorcière, en avril-mai.',
    tips: 'Réservé aux connaisseurs : ses sosies poussent au même moment, aux mêmes endroits.',
    cook: 'Poêlé, en omelette.',
    looks: [
      [3, 'Inocybe de Patouillard', 'Chapeau conique fibreux qui rougit, lames qui brunissent, même saison : MORTEL.'],
      [2, 'Entolome livide', 'Lames qui deviennent roses, odeur de farine aussi : toxique grave.'],
    ],
    wiki: 'Tricholome_de_la_Saint-Georges',
  },
  'chanterelle-grise': {
    look: [
      ['Chapeau', '2 à 5 cm, brun-gris, creusé ou troué au centre.'],
      ['Dessous', 'Des plis gris-jaunâtres (pas de vraies lames).'],
      ['Pied', 'Creux, jaune-gris.'],
    ],
    where: 'Sols acides et moussus, sous conifères et feuillus, tard en saison, souvent en grand nombre.',
    tips: 'Petite mais abondante : couper aux ciseaux pour garder la terre au sol.',
    cook: 'Poêlée, en omelette ; se sèche bien.',
    looks: [
      [1, 'Petits champignons à vraies lames', 'Omphales et petits clitocybes : à laisser, vérifier les plis.'],
    ],
    wiki: 'Craterellus_tubaeformis',
  },
};
export const DANGER = { 3: { icon: '☠️', label: 'mortel' }, 2: { icon: '⚠️', label: 'toxique' }, 1: { icon: 'ℹ️', label: 'sans danger grave' } };
