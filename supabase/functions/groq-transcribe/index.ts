import { AuthError, requireDashboardUser } from '../_shared/auth.ts';
import { jsonResponse, requestCorsHeaders } from '../_shared/http.ts';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

Deno.serve(async (request: Request): Promise<Response> => {
  const cors = requestCorsHeaders(request);
  if (!cors) return new Response('Origen no autorizado.', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Método no permitido.' }, 405);

  try {
    await requireDashboardUser(request);
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    const model = Deno.env.get('GROQ_TRANSCRIBE_MODEL') || 'whisper-large-v3-turbo';
    if (!groqApiKey) return jsonResponse(request, { error: 'Falta configurar GROQ_API_KEY en Supabase Secrets.' }, 503);

    const input = await request.formData();
    const audio = input.get('audio');
    if (!(audio instanceof File) || audio.size === 0) return jsonResponse(request, { error: 'No se recibió un archivo de audio.' }, 400);
    if (audio.size > MAX_AUDIO_BYTES) return jsonResponse(request, { error: 'El audio supera el límite de 20 MB.' }, 413);

    const groqForm = new FormData();
    groqForm.append('file', audio, audio.name || 'consulta.webm');
    groqForm.append('model', model);
    groqForm.append('language', 'es');
    groqForm.append('response_format', 'json');
    groqForm.append('temperature', '0');

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqApiKey}` },
      body: groqForm,
    });
    if (!groqResponse.ok) {
      return jsonResponse(
        request,
        { error: groqResponse.status === 429 ? 'Se alcanzó temporalmente el límite de transcripción.' : 'Groq no pudo transcribir el audio.', retryAfter: groqResponse.headers.get('retry-after') },
        groqResponse.status === 429 ? 429 : 502,
      );
    }
    const transcription = await groqResponse.json() as { text?: string };
    return jsonResponse(request, { text: transcription.text ?? '', model });
  } catch (error) {
    if (error instanceof AuthError) return jsonResponse(request, { error: error.message }, error.status);
    return jsonResponse(request, { error: error instanceof Error ? error.message : 'Solicitud inválida.' }, 400);
  }
});
