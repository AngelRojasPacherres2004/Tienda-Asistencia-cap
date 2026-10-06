export async function fetchFacebookInsights(url, secretKey, request = fetch) {
  if (!url || !secretKey) throw new Error("Falta configurar la conexión con Supabase.");
  const endpoint = `${url.replace(/\/$/, "")}/functions/v1/facebook-insights`;
  const response = await request(endpoint, {
    method: "GET",
    headers: { apikey: secretKey },
    signal: AbortSignal.timeout(12000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "No se pudo consultar Facebook.");
  if (!body.page || typeof body.page.id !== "string") throw new Error("Respuesta de Facebook no válida.");
  return body;
}
