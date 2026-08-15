import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const PRODUCTION_ORIGIN = 'https://dashboard-comercial-remates.netlify.app';

export function requestCorsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get('origin');
  const localOrigin = !!origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (origin && origin !== PRODUCTION_ORIGIN && !localOrigin) return null;
  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': origin || PRODUCTION_ORIGIN,
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
