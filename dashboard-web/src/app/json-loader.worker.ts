/// <reference lib="webworker" />

type LoadRequest = { urls: string[] };
type LoadResponse = { ok: true; data: unknown } | { ok: false; error: string };

addEventListener('message', async ({ data }: MessageEvent<LoadRequest>) => {
  try {
    if (!data.urls.length) throw new Error('No se recibieron partes para descargar.');
    const decoder = new TextDecoder('utf-8');
    let source = '';
    for (const url of data.urls) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        source += decoder.decode(await response.arrayBuffer(), { stream: true });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('La descarga tardó demasiado. Intenta nuevamente.');
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    source += decoder.decode();
    const payload = JSON.parse(source) as unknown;
    postMessage({ ok: true, data: payload } satisfies LoadResponse);
  } catch (error) {
    postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies LoadResponse);
  }
});
