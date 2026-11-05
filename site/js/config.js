// Configuration publique. La clé « publishable » est faite pour être côté client :
// la sécurité repose sur les règles RLS de la base. Ne JAMAIS mettre ici la clé service_role / secret.
export const SUPABASE_URL = 'https://vvegujltsjgwszeloyaz.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Zy1P_QNS2cmc62YzZ2M2Ig_P6rV0Fu2';

// Centre de départ : entre Aix et Marseille.
export const START = { lat: 43.42, lon: 5.6, zoom: 9 };

export const POISON_CENTER = { label: '04 91 75 25 25', tel: '+33491752525' };
