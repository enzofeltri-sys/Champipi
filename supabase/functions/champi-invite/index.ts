// Invitation par e-mail : quand l'admin ajoute quelqu'un, Supabase envoie le mail « Invite user »
// (modèle personnalisé : bienvenue + tuto, version famille ou amis selon {{ .Data.grp }}), avec un lien qui connecte directement.
//   POST { email }  (session de l'admin requise) → { status: 'sent' | 'exists' | 'not_member' }
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const SITE = 'https://enzofeltri-sys.github.io/Champipi/';
const ORIGINS = ['https://enzofeltri-sys.github.io', 'http://localhost:5173'];
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = (req: Request) => {
  const o = req.headers.get('origin') ?? '';
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
};
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' } });

async function userExists(email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    if (data.users.some((u) => (u.email ?? '').toLowerCase() === email)) return true;
    if (data.users.length < 200) return false;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  try {
    // Seul un admin connecté peut inviter.
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    const { data: u, error } = await admin.auth.getUser(jwt);
    if (error || !u.user) return json(req, { error: 'connexion requise' }, 401);
    const me = (u.user.email ?? '').toLowerCase();
    const { data: isAdmin } = await admin.from('champi_admins').select('email').eq('email', me).maybeSingle();
    if (!isAdmin) return json(req, { error: 'réservé à l\'administrateur' }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    const { data: m } = await admin.from('champi_allowed_emails').select('email, label, grp').eq('email', email).maybeSingle();
    if (!m) return json(req, { status: 'not_member' });
    if (await userExists(email)) return json(req, { status: 'exists' });
    const { error: e2 } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: SITE,
      data: { grp: m.grp ?? 'famille', label: m.label ?? '', invited_by: me },
    });
    if (e2) return json(req, { error: e2.message }, 502);
    return json(req, { status: 'sent' });
  } catch (err: any) {
    return json(req, { error: String(err?.message ?? err) }, 500);
  }
});
