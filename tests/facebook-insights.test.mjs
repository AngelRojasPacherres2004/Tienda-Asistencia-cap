import test from "node:test";
import assert from "node:assert/strict";
import { fetchFacebookInsights } from "../netlify/lib/facebook-insights.js";

test("consulta la función privada sin enviar el token de Meta al navegador", async () => {
  const result = await fetchFacebookInsights("https://example.supabase.co/", "sb_secret_test", async (url, options) => {
    assert.equal(url, "https://example.supabase.co/functions/v1/facebook-insights");
    assert.deepEqual(options.headers, { apikey: "sb_secret_test" });
    return new Response(JSON.stringify({ page: { id: "247354675387666", followers: 123 } }), { status: 200 });
  });
  assert.equal(result.page.followers, 123);
});

test("rechaza fallos y respuestas incompletas de la función", async () => {
  await assert.rejects(fetchFacebookInsights("https://example.supabase.co", "key", async () => new Response("{}", { status: 502 })));
  await assert.rejects(fetchFacebookInsights("https://example.supabase.co", "key", async () => new Response("{}", { status: 200 })), /no válida/);
});
