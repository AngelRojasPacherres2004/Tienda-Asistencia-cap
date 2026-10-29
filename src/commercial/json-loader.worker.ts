/// <reference lib="webworker" />

type FileEncoding = 'identity' | 'gzip';
type LoadRequest = {
  urls: string[];
  encoding: FileEncoding;
  cacheKey: string;
  cacheVersion: string;
  cacheEnabled: boolean;
};
type LoadResponse = { ok: true; data: unknown } | { ok: false; error: string };
type ProgressResponse = { progress: number; phase: 'download' | 'cache' | 'decode' };

const CACHE_NAME = 'dashboard-data-v2';
const MAX_CACHED_FILES = 120;

function joinBuffers(chunks: Uint8Array[]): ArrayBuffer {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}

function reportProgress(progress: number, phase: ProgressResponse['phase']): void {
  postMessage({ progress, phase } satisfies ProgressResponse);
}

async function downloadPart(url: string): Promise<Uint8Array> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(url, { cache: 'default', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('La descarga tardó demasiado. Intenta nuevamente.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
}

async function downloadParts(urls: string[]): Promise<ArrayBuffer> {
  const chunks = new Array<Uint8Array>(urls.length);
  let next = 0;
  let completed = 0;
  let failed = false;
  const runner = async (): Promise<void> => {
    while (next < urls.length && !failed) {
      const index = next++;
      try {
        chunks[index] = await downloadPart(urls[index]);
        completed += 1;
        reportProgress(Math.round((completed / urls.length) * 82), 'download');
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, () => runner()));
  if (chunks.some(chunk => !chunk)) throw new Error('La descarga del detalle quedó incompleta.');
  reportProgress(85, 'download');
  return joinBuffers(chunks);
}

async function loadCachedBinary(data: LoadRequest): Promise<ArrayBuffer> {
  if (!data.cacheEnabled || typeof caches === 'undefined') return downloadParts(data.urls);

  const cacheUrl = new URL(`/__dashboard_cache__/${encodeURIComponent(data.cacheKey)}`, location.origin).toString();
  let cache: Cache | undefined;
  try {
    cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(cacheUrl);
    if (cached) {
      reportProgress(85, 'cache');
      return cached.arrayBuffer();
    }
  } catch {
    // La caché es una optimización: una restricción del navegador no debe
    // impedir que el dashboard descargue y abra los datos.
  }

  const binary = await downloadParts(data.urls);
  if (cache) {
    try {
      await cache.put(
        cacheUrl,
        new Response(binary.slice(0), {
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Dashboard-Encoding': data.encoding,
          },
        }),
      );
      const cachedRequests = await cache.keys();
      if (cachedRequests.length > MAX_CACHED_FILES) {
        await Promise.all(cachedRequests.slice(0, cachedRequests.length - MAX_CACHED_FILES).map(request => cache!.delete(request)));
      }
    } catch {
      // Sigue con los bytes ya descargados aunque el dispositivo no tenga cuota local.
    }
  }
  return binary;
}

async function decodeJson(binary: ArrayBuffer, encoding: FileEncoding): Promise<unknown> {
  let decoded = binary;
  if (encoding === 'gzip') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Este navegador no admite la descompresión requerida.');
    }
    const decompressor = new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>;
    const stream = new Blob([binary]).stream().pipeThrough(decompressor);
    decoded = await new Response(stream).arrayBuffer();
  }
  return JSON.parse(new TextDecoder('utf-8').decode(decoded)) as unknown;
}

addEventListener('message', async ({ data }: MessageEvent<LoadRequest>) => {
  try {
    if (!data.urls.length) throw new Error('No se recibieron partes para descargar.');
    const binary = await loadCachedBinary(data);
    reportProgress(90, 'decode');
    const payload = await decodeJson(binary, data.encoding);
    reportProgress(98, 'decode');
    postMessage({ ok: true, data: payload } satisfies LoadResponse);
  } catch (error) {
    postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies LoadResponse);
  }
});
