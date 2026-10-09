import { withSupabase } from "npm:@supabase/server@1";

export default {
  fetch: withSupabase({ auth: "secret" }, async (req: Request) => {
    if (req.method !== "GET") return Response.json({ error: "Método no permitido." }, { status: 405 });

    const token = Deno.env.get("META_ACCESS_TOKEN");
    const pageId = Deno.env.get("META_PAGE_ID");
    if (!token || !pageId || !/^\d+$/.test(pageId)) {
      return Response.json({ error: "La conexión con Meta no está configurada." }, { status: 503 });
    }

    try {
      const url = new URL(`https://graph.facebook.com/v26.0/${pageId}`);
      url.searchParams.set("fields", "id,name,fan_count,followers_count");
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        console.error("Meta Graph API:", response.status);
        const message = response.status === 401
          ? "El token de Meta no es válido o venció. Actualízalo en Supabase."
          : response.status === 403
            ? "El token de Meta no tiene permisos para consultar esta página."
            : "No se pudo consultar la página de Facebook.";
        return Response.json({ error: message }, { status: 502 });
      }
      const page = await response.json();
      if (String(page.id) !== pageId) {
        return Response.json({ error: "Meta devolvió una página inesperada." }, { status: 502 });
      }
      return Response.json({
        page: {
          id: page.id,
          name: typeof page.name === "string" ? page.name : "Página de Facebook",
          followers: Number.isSafeInteger(page.followers_count) ? page.followers_count : null,
          likes: Number.isSafeInteger(page.fan_count) ? page.fan_count : null,
        },
        fetchedAt: new Date().toISOString(),
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("Meta Graph API:", error instanceof Error ? error.name : "unknown");
      return Response.json({ error: "No se pudo consultar la página de Facebook." }, { status: 502 });
    }
  }),
};
