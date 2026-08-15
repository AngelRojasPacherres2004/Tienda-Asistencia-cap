/// <reference lib="webworker" />

type LoadRequest = { urls: string[] };
type LoadResponse = { ok: true; data: unknown } | { ok: false; error: string };

addEventListener('message', async ({ data }: MessageEvent<LoadRequest>) => {
  try {
    if (!data.urls.length) throw new Error('No se recibieron partes para descargar.');
    const decoder = new TextDecoder('utf-8');
    let source = '';
    for (const url of data.urls) {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      source += decoder.decode(await response.arrayBuffer(), { stream: true });
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
