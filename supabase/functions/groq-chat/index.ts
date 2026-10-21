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
    const configuredFallbacks = (Deno.env.get('GROQ_FALLBACK_MODELS') || 'openai/gpt-oss-20b,qwen/qwen3.8-27b')
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
        content: 'Eres el asistente ejecutivo del Dashboard Comercial de Almacén de Remates. Nunca hagas preguntas, nunca solicites datos adicionales y nunca respondas que falta información: trabaja exclusivamente con los valores presentes y omite silenciosamente cualquier campo ausente. Si la consulta comienza con “MODO CONSEJO POR BLOQUE”, responde en español con exactamente cuatro líneas: LECTURA, HALLAZGO, RECOMENDACIÓN y PRÓXIMO PASO; cada línea debe ser breve, accionable y referirse solo al bloque solicitado. En cualquier otro caso responde con un máximo de 230 palabras y respeta la estructura solicitada por el usuario; si no especifica una, usa RESUMEN EJECUTIVO, HALLAZGOS CLAVE y PLAN DE ACCIÓN. Menciona cifras solo si están presentes y redondéalas de forma legible. Distingue lo observado de una inferencia. Cuando se pidan fórmulas, explica el nombre del KPI, su fórmula en una línea y el significado de sus variables; incluye un ejemplo solo si hay cifras suficientes. No uses tablas ni Markdown decorativo. No inventes datos, metas, porcentajes, personas ni plazos. No expongas información fuera del contexto recibido.',
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
          max_tokens: 900,
          ...(model.startsWith('openai/gpt-oss-') ? { reasoning_effort: 'high' } : {}),
          messages: promptMessages,
        }),
      });
      if (groqResponse.ok) {
        const completion = await groqResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
        const answer = completion.choices?.[0]?.message?.content?.trim() ?? '';
        // Algunos modelos de razonamiento pueden agotar la salida en razonamiento
        // interno. En ese caso se intenta el siguiente modelo, nunca se responde vacío.
        if (answer) return jsonResponse(request, { answer, model });
        lastStatus = 502;
        continue;
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
