import { createClient } from 'npm:@supabase/supabase-js@2';

export class AuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type DashboardIdentity = {
  userId: string;
  email: string;
  sessionId: string;
  profile: { is_active: boolean; active_session_id: string | null };
};

function decodeSessionId(token: string): string {
  try {
    const encoded = token.split('.')[1] ?? '';
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const payload = JSON.parse(atob(normalized)) as { session_id?: string };
    return String(payload.session_id ?? '');
  } catch {
    return '';
  }
}

export async function authenticateDashboardUser(request: Request): Promise<DashboardIdentity> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) throw new AuthError('Sesión requerida.', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) throw new AuthError('Supabase Auth no está configurado.', 503);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new AuthError('Sesión inválida o vencida.', 401);
  const sessionId = decodeSessionId(token);
  if (!sessionId) throw new AuthError('La sesión no contiene un identificador válido.', 401);

  const { data: profile, error: profileError } = await supabase
    .from('dashboard_users')
    .select('is_active,active_session_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (profileError || !profile?.is_active) throw new AuthError('Usuario sin acceso al dashboard.', 403);

  return {
    userId: userData.user.id,
    email: userData.user.email ?? '',
    sessionId,
    profile: { is_active: profile.is_active, active_session_id: profile.active_session_id ?? null },
  };
}

export async function requireDashboardUser(request: Request): Promise<{ userId: string; email: string; sessionId: string }> {
  const identity = await authenticateDashboardUser(request);
  if (identity.profile.active_session_id !== identity.sessionId) {
    throw new AuthError('Esta cuenta se inició en otro dispositivo.', 409);
  }
  return { userId: identity.userId, email: identity.email, sessionId: identity.sessionId };
}
