import { createClient } from 'npm:@supabase/supabase-js@2';
import { AuthError, authenticateDashboardUser } from '../_shared/auth.ts';
import { jsonResponse, requestCorsHeaders } from '../_shared/http.ts';

type SessionAction = 'claim' | 'ensure' | 'verify' | 'release';

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

Deno.serve(async (request: Request): Promise<Response> => {
  const cors = requestCorsHeaders(request);
  if (!cors) return new Response('Origen no autorizado.', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Método no permitido.' }, 405);

  try {
    const identity = await authenticateDashboardUser(request);
    const body = await request.json().catch(() => ({})) as { action?: SessionAction };
    const action = body.action ?? 'verify';
    if (!['claim', 'ensure', 'verify', 'release'].includes(action)) {
      return jsonResponse(request, { error: 'Acción de sesión no válida.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const adminKey = secretKey();
    if (!supabaseUrl || !adminKey) throw new AuthError('Control de sesión no configurado.', 503);
    const admin = createClient(supabaseUrl, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const current = identity.profile.active_session_id;
    const now = new Date().toISOString();

    if (action === 'claim' || (action === 'ensure' && !current)) {
      const { error } = await admin.from('dashboard_users').update({
        active_session_id: identity.sessionId,
        session_claimed_at: now,
        session_seen_at: now,
        updated_at: now,
      }).eq('user_id', identity.userId).eq('is_active', true);
      if (error) throw new AuthError('No se pudo registrar el dispositivo.', 500);
      return jsonResponse(request, { active: true, replacedPrevious: !!current && current !== identity.sessionId });
    }

    if (current !== identity.sessionId) {
      throw new AuthError('Esta cuenta ya está abierta en otro dispositivo.', 409);
    }

    if (action === 'release') {
      const { error } = await admin.from('dashboard_users').update({
        active_session_id: null,
        session_seen_at: now,
        updated_at: now,
      }).eq('user_id', identity.userId).eq('active_session_id', identity.sessionId);
      if (error) throw new AuthError('No se pudo cerrar la sesión.', 500);
      return jsonResponse(request, { active: false });
    }

    await admin.from('dashboard_users').update({ session_seen_at: now }).eq('user_id', identity.userId).eq('active_session_id', identity.sessionId);
    return jsonResponse(request, { active: true });
  } catch (error) {
    if (error instanceof AuthError) return jsonResponse(request, { error: error.message }, error.status);
    return jsonResponse(request, { error: error instanceof Error ? error.message : 'Solicitud inválida.' }, 400);
  }
});
