import { AuthError, requireDashboardUser } from '../_shared/auth.ts';
import { jsonResponse, requestCorsHeaders } from '../_shared/http.ts';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

Deno.serve(async (request: Request): Promise<Response> => {
  const cors = requestCorsHeaders(request);
  if (!cors) return new Response('Origen no autorizado.', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Método no permitido.' }, 405);

  try {
    await requireDashboardUser(request);
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) return jsonResponse(request, { error: 'El asistente no está configurado.' }, 503);

    const primaryModel = Deno.env.get('GROQ_CHAT_MODEL') || 'openai/gpt-oss-120b';
    const configuredFallbacks = (Deno.env.get('GROQ_FALLBACK_MODELS') || 'openai/gpt-oss-20b,llama-3.1-8b-instant')
      .split(',').map(value => value.trim()).filter(Boolean);
    const models = [...new Set([primaryModel, ...configuredFallbacks])];

    const payload = await request.json() as { messages?: ChatMessage[]; context?: string };
    const messages = (payload.messages ?? []).slice(-12).filter(message =>
      (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
      && message.content.trim().length > 0
      && message.content.length <= 4_000,
    );
    if (!messages.length) return jsonResponse(request, { error: 'Escribe una consulta para el asistente.' }, 400);
    const dashboardContext = (payload.context ?? '').slice(0, 16_000);
    const promptMessages = [
      {
        role: 'system',
        content: 'Eres el asistente ejecutivo del Dashboard Comercial de Almacén de Remates. Responde en español claro y sencillo, con un máximo de 180 palabras y seis viñetas. Usa texto limpio: no emplees tablas, asteriscos, encabezados ni otra sintaxis Markdown. No repitas todos los KPIs: prioriza dos o tres hallazgos y una acción concreta. Analiza ventas, stock, rotación, cobertura, EOQ y ROP. Distingue cifras observadas, inferencias y recomendaciones. No inventes datos, metas, porcentajes esperados ni plazos que no estén en el contexto. No expongas información fuera del contexto recibido.',
      },
      ...(dashboardContext ? [{ role: 'system', content: `Contexto visible del dashboard:\n${dashboardContext}` }] : []),
      ...messages,
    ];

    let lastStatus = 502;
    let retryAfter: string | null = null;
    for (const model of models) {
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.15,
          max_completion_tokens: 1_600,
          ...(model.startsWith('openai/gpt-oss-') ? { reasoning_effort: 'high' } : {}),
          messages: promptMessages,
        }),
      });
      if (groqResponse.ok) {
        const completion = await groqResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
        return jsonResponse(request, { answer: completion.choices?.[0]?.message?.content ?? 'Sin respuesta.', model });
      }

      lastStatus = groqResponse.status;
      retryAfter = groqResponse.headers.get('retry-after');
      // Credencial inválida o solicitud mal formada: otro modelo no solucionará el problema.
      if ([400, 401, 403].includes(lastStatus)) break;
      // En límites, indisponibilidad o retiro de un modelo, probar el siguiente.
      if (lastStatus !== 404 && lastStatus !== 408 && lastStatus !== 429 && lastStatus < 500) break;
    }

    return jsonResponse(
      request,
      { error: lastStatus === 429 ? 'La IA alcanzó temporalmente su límite gratuito.' : 'La IA no está disponible en este momento.', retryAfter },
      lastStatus === 429 ? 429 : 503,
    );
  } catch (error) {
    if (error instanceof AuthError) return jsonResponse(request, { error: error.message }, error.status);
    return jsonResponse(request, { error: error instanceof Error ? error.message : 'Solicitud inválida.' }, 400);
  }
});
