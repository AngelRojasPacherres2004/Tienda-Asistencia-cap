import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const PRODUCTION_ORIGINS = new Set([
  'https://dashboard-comercial-remates.netlify.app',
  'https://dashboard-general-comercial.netlify.app',
]);

export function requestCorsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get('origin');
  let localOrigin = false;
  if (origin) {
    try {
      const parsed = new URL(origin);
      localOrigin = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    } catch {
      localOrigin = false;
    }
  }
  if (origin && !PRODUCTION_ORIGINS.has(origin) && !localOrigin) return null;
  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': origin || 'https://dashboard-comercial-remates.netlify.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  const cors = requestCorsHeaders(request) ?? {};
  return Response.json(body, {
    status,
    headers: {
      ...cors,
      ...extraHeaders,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
