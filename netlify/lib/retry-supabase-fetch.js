// Supabase puede responder brevemente 401 si un nodo aún no reconoce el iat del JWT.
export async function retrySupabaseRead(input, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const first = await fetch(input, init);
  if (!["GET", "HEAD"].includes(method) || first.status !== 401) return first;
  const body = await first.clone().text();
  if (!body.includes("JWT issued at future")) return first;
  await new Promise(resolve => setTimeout(resolve, 300));
  return fetch(input, init);
}
