import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, requestCorsHeaders } from '../_shared/http.ts';

type Credentials = { username?: string; password?: string };

function secretKey(): string {
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
    if (!/^[a-z0-9][a-z0-9._-]{2,48}$/.test(usernameKey) || !password || password.length > 256) {
      return invalidCredentials(request);
    }

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const adminKey = secretKey();
    if (!url || !anonKey || !adminKey) return jsonResponse(request, { error: 'El acceso no está configurado.' }, 503);

    const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin
      .from('dashboard_users')
      .select('user_id,is_active')
      .eq('username_key', usernameKey)
      .maybeSingle();
    if (profileError || !profile?.is_active) return invalidCredentials(request);

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.user_id);
    const authEmail = userData.user?.email;
    if (userError || !authEmail) return invalidCredentials(request);

    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: login, error: loginError } = await auth.auth.signInWithPassword({ email: authEmail, password });
    if (loginError || !login.session) return invalidCredentials(request);

    return jsonResponse(request, {
      access_token: login.session.access_token,
      refresh_token: login.session.refresh_token,
    });
  } catch {
    return invalidCredentials(request);
  }
});
