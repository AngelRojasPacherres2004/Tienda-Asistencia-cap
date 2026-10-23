import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, requestCorsHeaders } from '../_shared/http.ts';

type Credentials = { username?: string; password?: string };

function secretKey(): string {
  const configured = Deno.env.get('DASHBOARD_SERVICE_ROLE_KEY') ?? '';
  if (configured) return configured;
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? '';
  } catch {
    return '';
  }
}

function invalidCredentials(request: Request): Response {
  return jsonResponse(request, { error: 'Usuario o contraseña incorrectos.' }, 401);
}

Deno.serve(async (request: Request): Promise<Response> => {
  const cors = requestCorsHeaders(request);
  if (!cors) return new Response('Origen no autorizado.', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Método no permitido.' }, 405);

  try {
    const body = await request.json().catch(() => ({})) as Credentials;
    const username = String(body.username ?? '').trim();
    const usernameKey = username.toLowerCase();
    const password = String(body.password ?? '');
    if (!/^[a-z0-9][a-z0-9._-]{1,48}$/.test(usernameKey) || !password || password.length > 256) {
      return invalidCredentials(request);
    }

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const adminKey = secretKey();
    if (!url || !anonKey || !adminKey) return jsonResponse(request, { error: 'El acceso no está configurado.' }, 503);

    const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin
      .from('dashboard_users')
      .select('user_id,is_active,contrasena,role')
      .eq('username_key', usernameKey)
      .maybeSingle();
    if (profileError || !profile?.is_active || profile.contrasena !== password) return invalidCredentials(request);

    const { data: role, error: roleError } = await admin
      .from('dashboard_roles')
      .select('can_access_dashboard,is_active,scope_type')
      .eq('code', profile.role)
      .maybeSingle();
    if (roleError || !role?.is_active || !role.can_access_dashboard || role.scope_type === 'none') {
      return jsonResponse(request, { error: 'Este usuario no tiene acceso al dashboard comercial.' }, 403);
    }
    if (role.scope_type !== 'all') {
      const { data: scopes, error: scopesError } = await admin
        .from('dashboard_user_scopes')
        .select('scope_value')
        .eq('user_id', profile.user_id)
        .eq('scope_type', role.scope_type)
        .limit(1);
      if (scopesError || !scopes?.length) {
        return jsonResponse(request, { error: 'Este usuario todavía no tiene una tienda o clúster asignado.' }, 403);
      }
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.user_id);
    const authEmail = userData.user?.email;
    if (userError || !authEmail) return invalidCredentials(request);

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: authEmail });
    const tokenHash = link.properties?.hashed_token;
    if (linkError || !tokenHash) return invalidCredentials(request);

    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: login, error: loginError } = await auth.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (loginError || !login.session) return invalidCredentials(request);

    return jsonResponse(request, {
      access_token: login.session.access_token,
      refresh_token: login.session.refresh_token,
    });
  } catch {
    return invalidCredentials(request);
  }
});
