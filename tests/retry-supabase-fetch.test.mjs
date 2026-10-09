import test from "node:test";
import assert from "node:assert/strict";
import { retrySupabaseRead } from "../netlify/lib/retry-supabase-fetch.js";

test("reintenta solo lecturas con JWT emitido en el futuro", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? new Response('{"message":"JWT issued at future"}', { status: 401 }) : new Response("ok");
  };
  try {
    assert.equal((await retrySupabaseRead("https://db.invalid")) .status, 200);
    assert.equal(calls, 2);
    calls = 0;
    assert.equal((await retrySupabaseRead("https://db.invalid", { method: "POST" })).status, 401);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
